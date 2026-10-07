import type { IncomingMessage, ServerResponse } from "node:http";
import type { AcademicCycleStatus, ApplicationType, EnrollmentStatus, GradeLevel, Sex, StudentStatus } from "../generated/prisma/client";
import {
  createCycle,
  createGrade,
  cycleStatuses,
  gradeLevels,
  hasAnyPermission,
  listCycles,
  listGrades,
  parseDateOnly,
  updateCycle,
  updateGrade,
  type PrincipalLike,
} from "./catalog";
import {
  applicationTypes,
  createEnrollment,
  enrollmentStatuses,
  getEnrollment,
  listEnrollments,
  transitionEnrollmentStatus,
} from "./enrollments";
import {
  createStudent,
  getStudent,
  listStudents,
  sexes,
  studentStatuses,
  updateStudent,
} from "./students";

export class DomainError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function asDomainError(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    throw new DomainError(
      (error as { status: number }).status,
      (error as { message: string }).message,
    );
  }
  throw error;
}

async function wrapDomain<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return asDomainError(error);
  }
}

type RouteHelpers = {
  sendJson: (
    request: IncomingMessage,
    response: ServerResponse,
    status: number,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ) => void;
  readJson: (request: IncomingMessage) => Promise<unknown>;
  authenticatedPrincipal: (request: IncomingMessage) => Promise<PrincipalLike>;
  requirePermission: (principal: { permissions: string[] }, permission: string) => void;
  HttpError: new (status: number, message: string) => Error & { status: number };
};

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string, min = 1, max = 200) {
  if (typeof value !== "string") throw new DomainError(400, `${field} es obligatorio`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new DomainError(400, `${field} debe contener entre ${min} y ${max} caracteres`);
  }
  return trimmed;
}

function requireInt(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DomainError(400, `${field} debe ser un entero`);
  }
  return value;
}

function optionalInt(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  return requireInt(value, field);
}

function pagination(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(page) || page < 1) throw new DomainError(400, "page debe ser un entero positivo");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainError(400, "limit debe ser un entero entre 1 y 100");
  }
  return { page, limit };
}

function pathId(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  const [id, ...tail] = rest.split("/");
  if (!id || !uuidRe.test(id)) return undefined;
  return { id, tail };
}

export async function handleSchoolRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  helpers: RouteHelpers,
): Promise<boolean> {
  const { sendJson, readJson, authenticatedPrincipal, requirePermission, HttpError } = helpers;

  try {
    // --- Ciclos escolares ---
    if (request.method === "GET" && url.pathname === "/api/academic-cycles") {
      const principal = await authenticatedPrincipal(request);
      if (!hasAnyPermission(principal, ["settings.manage", "enrollment.read", "student.read", "enrollment.write"])) {
        throw new HttpError(403, "No tienes permiso para realizar esta acción");
      }
      const statusParam = url.searchParams.get("status");
      const status =
        statusParam && cycleStatuses.includes(statusParam as (typeof cycleStatuses)[number])
          ? (statusParam as AcademicCycleStatus)
          : undefined;
      const data = await wrapDomain(() => listCycles(principal.schoolId, status));
      sendJson(request, response, 200, { data });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/academic-cycles") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "settings.manage");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      const statusValue = body.status ?? "PLANNED";
      if (!cycleStatuses.includes(statusValue as (typeof cycleStatuses)[number])) {
        throw new DomainError(400, "Estado de ciclo no válido");
      }
      const data = await wrapDomain(() =>
        createCycle(principal.schoolId, {
          name: requireString(body.name, "name", 2, 50),
          year: requireInt(body.year, "year"),
          startDate: parseDateOnly(body.startDate, "startDate"),
          endDate: parseDateOnly(body.endDate, "endDate"),
          status: statusValue as AcademicCycleStatus,
        }),
      );
      sendJson(request, response, 201, { data });
      return true;
    }

    const cyclePath = pathId(url.pathname, "/api/academic-cycles/");
    if (cyclePath && cyclePath.tail.length === 0 && request.method === "PATCH") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "settings.manage");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      const data = await wrapDomain(() =>
        updateCycle(principal.schoolId, cyclePath.id, {
          ...(body.name !== undefined ? { name: requireString(body.name, "name", 2, 50) } : {}),
          ...(body.year !== undefined ? { year: requireInt(body.year, "year") } : {}),
          ...(body.startDate !== undefined
            ? { startDate: parseDateOnly(body.startDate, "startDate") }
            : {}),
          ...(body.endDate !== undefined ? { endDate: parseDateOnly(body.endDate, "endDate") } : {}),
          ...(body.status !== undefined
            ? {
                status: cycleStatuses.includes(body.status as (typeof cycleStatuses)[number])
                  ? (body.status as AcademicCycleStatus)
                  : (() => {
                      throw new DomainError(400, "Estado de ciclo no válido");
                    })(),
              }
            : {}),
        }),
      );
      sendJson(request, response, 200, { data });
      return true;
    }

    // --- Grados ---
    if (request.method === "GET" && url.pathname === "/api/grades") {
      const principal = await authenticatedPrincipal(request);
      if (!hasAnyPermission(principal, ["settings.manage", "enrollment.read", "student.read", "enrollment.write"])) {
        throw new HttpError(403, "No tienes permiso para realizar esta acción");
      }
      const activeOnly = url.searchParams.get("active") === "true";
      const data = await wrapDomain(() => listGrades(principal.schoolId, activeOnly));
      sendJson(request, response, 200, { data });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/grades") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "settings.manage");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      if (!gradeLevels.includes(body.level as (typeof gradeLevels)[number])) {
        throw new DomainError(400, "Nivel de grado no válido");
      }
      const data = await wrapDomain(() =>
        createGrade(principal.schoolId, {
          code: requireString(body.code, "code", 1, 30).toUpperCase(),
          name: requireString(body.name, "name", 2, 100),
          level: body.level as GradeLevel,
          displayOrder: requireInt(body.displayOrder, "displayOrder"),
          minAge: optionalInt(body.minAge, "minAge"),
          maxAge: optionalInt(body.maxAge, "maxAge"),
          active: typeof body.active === "boolean" ? body.active : true,
        }),
      );
      sendJson(request, response, 201, { data });
      return true;
    }

    const gradePath = pathId(url.pathname, "/api/grades/");
    if (gradePath && gradePath.tail.length === 0 && request.method === "PATCH") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "settings.manage");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      const data = await wrapDomain(() =>
        updateGrade(principal.schoolId, gradePath.id, {
          ...(body.code !== undefined ? { code: requireString(body.code, "code", 1, 30).toUpperCase() } : {}),
          ...(body.name !== undefined ? { name: requireString(body.name, "name", 2, 100) } : {}),
          ...(body.level !== undefined
            ? {
                level: gradeLevels.includes(body.level as (typeof gradeLevels)[number])
                  ? (body.level as GradeLevel)
                  : (() => {
                      throw new DomainError(400, "Nivel de grado no válido");
                    })(),
              }
            : {}),
          ...(body.displayOrder !== undefined
            ? { displayOrder: requireInt(body.displayOrder, "displayOrder") }
            : {}),
          ...(body.minAge !== undefined ? { minAge: optionalInt(body.minAge, "minAge") } : {}),
          ...(body.maxAge !== undefined ? { maxAge: optionalInt(body.maxAge, "maxAge") } : {}),
          ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        }),
      );
      sendJson(request, response, 200, { data });
      return true;
    }

    // --- Alumnos ---
    if (request.method === "GET" && url.pathname === "/api/students") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "student.read");
      const { page, limit } = pagination(url);
      const statusParam = url.searchParams.get("status");
      const status =
        statusParam && studentStatuses.includes(statusParam as (typeof studentStatuses)[number])
          ? (statusParam as StudentStatus)
          : undefined;
      const result = await wrapDomain(() =>
        listStudents(principal.schoolId, {
          page,
          limit,
          q: url.searchParams.get("q")?.trim() || undefined,
          status,
        }),
      );
      sendJson(request, response, 200, result);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/students") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "student.write");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      if (body.sex !== undefined && !sexes.includes(body.sex as (typeof sexes)[number])) {
        throw new DomainError(400, "Sexo no válido");
      }
      const data = await wrapDomain(() =>
        createStudent(principal.schoolId, {
          givenNames: requireString(body.givenNames, "givenNames", 1, 120),
          firstSurname: requireString(body.firstSurname, "firstSurname", 1, 80),
          secondSurname: typeof body.secondSurname === "string" ? body.secondSurname : null,
          usualName: typeof body.usualName === "string" ? body.usualName : null,
          birthPlace: typeof body.birthPlace === "string" ? body.birthPlace : null,
          birthDate: typeof body.birthDate === "string" || body.birthDate === null ? body.birthDate : null,
          cui: typeof body.cui === "string" || body.cui === null ? body.cui : null,
          homePhone: typeof body.homePhone === "string" ? body.homePhone : null,
          sex: body.sex as Sex | undefined,
          notes: typeof body.notes === "string" ? body.notes : null,
        }),
      );
      sendJson(request, response, 201, { data });
      return true;
    }

    const studentPath = pathId(url.pathname, "/api/students/");
    if (studentPath && studentPath.tail.length === 0 && request.method === "GET") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "student.read");
      const data = await wrapDomain(() => getStudent(principal.schoolId, studentPath.id));
      sendJson(request, response, 200, { data });
      return true;
    }

    if (studentPath && studentPath.tail.length === 0 && request.method === "PATCH") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "student.write");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      if (body.sex !== undefined && !sexes.includes(body.sex as (typeof sexes)[number])) {
        throw new DomainError(400, "Sexo no válido");
      }
      if (
        body.status !== undefined &&
        !studentStatuses.includes(body.status as (typeof studentStatuses)[number])
      ) {
        throw new DomainError(400, "Estado de alumno no válido");
      }
      const data = await wrapDomain(() =>
        updateStudent(principal.schoolId, studentPath.id, {
          givenNames: requireString(body.givenNames, "givenNames", 1, 120),
          firstSurname: requireString(body.firstSurname, "firstSurname", 1, 80),
          secondSurname: typeof body.secondSurname === "string" ? body.secondSurname : null,
          usualName: typeof body.usualName === "string" ? body.usualName : null,
          birthPlace: typeof body.birthPlace === "string" ? body.birthPlace : null,
          birthDate: typeof body.birthDate === "string" || body.birthDate === null ? body.birthDate : null,
          ...(body.cui !== undefined
            ? { cui: typeof body.cui === "string" || body.cui === null ? body.cui : null }
            : {}),
          homePhone: typeof body.homePhone === "string" ? body.homePhone : null,
          sex: body.sex as Sex | undefined,
          status: body.status as StudentStatus | undefined,
          notes: typeof body.notes === "string" ? body.notes : null,
        }),
      );
      sendJson(request, response, 200, { data });
      return true;
    }

    // --- Inscripciones ---
    if (request.method === "GET" && url.pathname === "/api/enrollments") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "enrollment.read");
      const { page, limit } = pagination(url);
      const statusParam = url.searchParams.get("status");
      const status =
        statusParam && enrollmentStatuses.includes(statusParam as (typeof enrollmentStatuses)[number])
          ? (statusParam as EnrollmentStatus)
          : undefined;
      const academicCycleId = url.searchParams.get("academicCycleId") ?? undefined;
      const gradeId = url.searchParams.get("gradeId") ?? undefined;
      if (academicCycleId && !uuidRe.test(academicCycleId)) {
        throw new DomainError(400, "academicCycleId no es válido");
      }
      if (gradeId && !uuidRe.test(gradeId)) throw new DomainError(400, "gradeId no es válido");
      const result = await wrapDomain(() =>
        listEnrollments(principal.schoolId, {
          page,
          limit,
          academicCycleId,
          gradeId,
          status,
          q: url.searchParams.get("q")?.trim() || undefined,
        }),
      );
      sendJson(request, response, 200, result);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/enrollments") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "enrollment.write");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      if (!applicationTypes.includes(body.applicationType as (typeof applicationTypes)[number])) {
        throw new DomainError(400, "Tipo de inscripción no válido");
      }
      for (const field of ["studentId", "academicCycleId", "gradeId"] as const) {
        if (typeof body[field] !== "string" || !uuidRe.test(body[field])) {
          throw new DomainError(400, `${field} no es válido`);
        }
      }
      const data = await wrapDomain(() =>
        createEnrollment(principal.schoolId, principal.id, {
          studentId: body.studentId as string,
          academicCycleId: body.academicCycleId as string,
          gradeId: body.gradeId as string,
          applicationType: body.applicationType as ApplicationType,
          notes: typeof body.notes === "string" ? body.notes : null,
        }),
      );
      sendJson(request, response, 201, { data });
      return true;
    }

    const enrollmentPath = pathId(url.pathname, "/api/enrollments/");
    if (enrollmentPath && enrollmentPath.tail.length === 0 && request.method === "GET") {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "enrollment.read");
      const data = await wrapDomain(() => getEnrollment(principal.schoolId, enrollmentPath.id));
      sendJson(request, response, 200, { data });
      return true;
    }

    if (
      enrollmentPath &&
      enrollmentPath.tail.length === 1 &&
      enrollmentPath.tail[0] === "status" &&
      request.method === "PATCH"
    ) {
      const principal = await authenticatedPrincipal(request);
      requirePermission(principal, "enrollment.write");
      const body = await readJson(request);
      if (!isObject(body)) throw new DomainError(400, "El cuerpo debe ser un objeto JSON");
      if (!enrollmentStatuses.includes(body.status as (typeof enrollmentStatuses)[number])) {
        throw new DomainError(400, "Estado de inscripción no válido");
      }
      const nextStatus = body.status as EnrollmentStatus;
      if (nextStatus === "APPROVED") {
        requirePermission(principal, "enrollment.approve");
      }
      const data = await wrapDomain(() =>
        transitionEnrollmentStatus(principal.schoolId, principal.id, enrollmentPath.id, nextStatus, {
          rejectionReason: typeof body.rejectionReason === "string" ? body.rejectionReason : null,
          notes: typeof body.notes === "string" ? body.notes : undefined,
        }),
      );
      sendJson(request, response, 200, { data });
      return true;
    }

    return false;
  } catch (error) {
    if (error instanceof DomainError) {
      throw new HttpError(error.status, error.message);
    }
    throw error;
  }
}
