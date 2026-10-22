import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { buildFullName } from "./personName";

/**
 * Direcciones del alumno y de sus responsables (MA-28).
 *
 * Una fila de `addresses` puede compartirse entre el alumno y sus guardianes (la dirección
 * del hogar). Editar la dirección del alumno la actualiza para todos los que la comparten;
 * un guardián que se muda recibe una dirección propia. `formatAddress` produce el texto que
 * reutilizan la ficha y la ficha PDF de inscripción, sin volver a digitarlo.
 */

type Client = Prisma.TransactionClient | typeof prisma;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const invalid = (message: string) => fail(400, message);

export const addressFields = [
  "fullAddress",
  "lot",
  "block",
  "sector",
  "zone",
  "neighborhood",
  "village",
  "municipality",
  "department",
  "country",
  "reference",
] as const;

type AddressField = (typeof addressFields)[number];
export type AddressInput = Omit<Record<AddressField, string | null>, "country"> & { country: string };

const limits: Record<AddressField, [string, number]> = {
  fullAddress: ["La dirección", 300],
  lot: ["El lote", 30],
  block: ["La manzana", 30],
  sector: ["El sector", 80],
  zone: ["La zona", 20],
  neighborhood: ["La colonia o barrio", 120],
  village: ["La aldea o caserío", 120],
  municipality: ["El municipio", 100],
  department: ["El departamento", 100],
  country: ["El país", 100],
  reference: ["La referencia", 500],
};

export const addressSelect = {
  id: true,
  fullAddress: true,
  lot: true,
  block: true,
  sector: true,
  zone: true,
  neighborhood: true,
  village: true,
  municipality: true,
  department: true,
  country: true,
  reference: true,
} as const satisfies Prisma.AddressSelect;

export type AddressRow = Prisma.AddressGetPayload<{ select: typeof addressSelect }>;

/** Dirección en una línea, en el orden en que se escribe en Guatemala. */
export function formatAddress(address: Omit<AddressRow, "id"> | null | undefined) {
  if (!address) return null;
  const parts = [
    address.fullAddress,
    address.lot && `Lote ${address.lot}`,
    address.block && `Manzana ${address.block}`,
    address.sector && `Sector ${address.sector}`,
    address.zone && `Zona ${address.zone}`,
    address.neighborhood,
    address.village,
    address.municipality,
    address.department,
    address.country && address.country !== "Guatemala" ? address.country : null,
  ];
  return parts.filter(Boolean).join(", ") || null;
}

export function publicAddress(address: AddressRow | null) {
  if (!address) return null;
  return { ...address, formatted: formatAddress(address) };
}

export function parseAddressInput(body: unknown): AddressInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("La dirección debe ser un objeto");
  const values = body as Record<string, unknown>;
  const unknownField = Object.keys(values).find((field) => !addressFields.includes(field as AddressField));
  if (unknownField) throw invalid(`Campo no permitido en la dirección: ${unknownField}`);

  const parsed = {} as Record<AddressField, string | null>;
  for (const field of addressFields) {
    const raw = values[field];
    const [label, max] = limits[field];
    if (raw !== undefined && raw !== null && typeof raw !== "string") throw invalid(`${label} debe ser texto`);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text.length > max) throw invalid(`${label} no puede superar ${max} caracteres`);
    parsed[field] = text || null;
  }
  if (!parsed.municipality || !parsed.department) throw invalid("El municipio y el departamento son obligatorios");
  if (!parsed.fullAddress && !parsed.neighborhood && !parsed.village) {
    throw invalid("Indique la dirección, la colonia o la aldea");
  }
  return { ...parsed, country: parsed.country ?? "Guatemala" };
}

/** Quién más usa una dirección, para avisar que el cambio se comparte. */
async function addressUsers(client: Client, addressId: string) {
  const [students, guardians] = await Promise.all([
    client.student.findMany({
      where: { addressId, deletedAt: null },
      select: { id: true, givenNames: true, firstSurname: true, secondSurname: true },
    }),
    client.guardian.findMany({
      where: { addressId, deletedAt: null },
      select: { id: true, givenNames: true, firstSurname: true, secondSurname: true },
    }),
  ]);
  return [
    ...students.map((s) => ({ type: "student" as const, id: s.id, fullName: buildFullName(s.givenNames, s.firstSurname, s.secondSurname) })),
    ...guardians.map((g) => ({ type: "guardian" as const, id: g.id, fullName: buildFullName(g.givenNames, g.firstSurname, g.secondSurname) })),
  ];
}

async function deleteIfOrphan(tx: Prisma.TransactionClient, addressId: string | null) {
  if (!addressId) return;
  if ((await addressUsers(tx, addressId)).length === 0) await tx.address.delete({ where: { id: addressId } });
}

async function findStudent(client: Client, schoolId: string, studentId: string) {
  const student = await client.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    select: { id: true, addressId: true, address: { select: addressSelect } },
  });
  if (!student) throw fail(404, "Alumno no encontrado");
  return student;
}

export async function getStudentAddress(schoolId: string, studentId: string) {
  const student = await findStudent(prisma, schoolId, studentId);
  return {
    address: publicAddress(student.address),
    sharedWith: student.addressId
      ? (await addressUsers(prisma, student.addressId)).filter((user) => user.id !== studentId)
      : [],
  };
}

/** Dirección del hogar: si ya existe se actualiza en su lugar, también para quienes la comparten. */
export async function saveStudentAddress(schoolId: string, actorId: string, studentId: string, input: AddressInput) {
  return prisma.$transaction(async (tx) => {
    const student = await findStudent(tx, schoolId, studentId);
    let addressId = student.addressId;
    if (addressId) {
      await tx.address.update({ where: { id: addressId }, data: input });
    } else {
      addressId = (await tx.address.create({ data: input, select: { id: true } })).id;
      await tx.student.update({ where: { id: studentId }, data: { addressId } });
    }
    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: student.addressId ? "UPDATE" : "CREATE",
        entityType: "Address",
        entityId: addressId,
        // La dirección es un dato personal: solo se registra a quién pertenece.
        afterData: { studentId },
      },
    });
    const address = await tx.address.findUniqueOrThrow({ where: { id: addressId }, select: addressSelect });
    return {
      address: publicAddress(address),
      sharedWith: (await addressUsers(tx, addressId)).filter((user) => user.id !== studentId),
    };
  });
}

export type GuardianAddressCommand =
  | { sameAsStudentId: string }
  | { address: AddressInput }
  | { address: null };

export function parseGuardianAddressBody(body: unknown): GuardianAddressCommand {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("El cuerpo debe ser un objeto JSON");
  const values = body as Record<string, unknown>;
  const keys = Object.keys(values);
  if (keys.length !== 1 || !["sameAsStudentId", "address"].includes(keys[0])) {
    throw invalid("Envíe sameAsStudentId para compartir la dirección del alumno o address con la dirección propia");
  }
  if (keys[0] === "sameAsStudentId") {
    if (typeof values.sameAsStudentId !== "string" || !/^[0-9a-f-]{36}$/i.test(values.sameAsStudentId)) {
      throw invalid("sameAsStudentId no es válido");
    }
    return { sameAsStudentId: values.sameAsStudentId };
  }
  return values.address === null ? { address: null } : { address: parseAddressInput(values.address) };
}

export async function saveGuardianAddress(
  schoolId: string,
  actorId: string,
  guardianId: string,
  command: GuardianAddressCommand,
) {
  return prisma.$transaction(async (tx) => {
    const guardian = await tx.guardian.findFirst({
      where: { id: guardianId, deletedAt: null, studentLinks: { some: { student: { schoolId } } } },
      select: { id: true, addressId: true },
    });
    if (!guardian) throw fail(404, "Responsable no encontrado");
    const previousId = guardian.addressId;
    let addressId: string | null;

    if ("sameAsStudentId" in command) {
      // Solo se comparte la dirección de un alumno del que es responsable vigente.
      const student = await tx.student.findFirst({
        where: {
          id: command.sameAsStudentId,
          schoolId,
          deletedAt: null,
          guardianLinks: { some: { guardianId, active: true } },
        },
        select: { addressId: true },
      });
      if (!student) throw fail(404, "El responsable no está vinculado a ese alumno");
      if (!student.addressId) throw fail(409, "Registre primero la dirección del alumno");
      addressId = student.addressId;
    } else if (command.address === null) {
      addressId = null;
    } else {
      // Si comparte la dirección con otros, un cambio propio la separa en vez de mudar a todos.
      const sharedWithOthers = previousId
        ? (await addressUsers(tx, previousId)).some((user) => !(user.type === "guardian" && user.id === guardianId))
        : false;
      if (previousId && !sharedWithOthers) {
        await tx.address.update({ where: { id: previousId }, data: command.address });
        addressId = previousId;
      } else {
        addressId = (await tx.address.create({ data: command.address, select: { id: true } })).id;
      }
    }

    if (addressId !== previousId) {
      await tx.guardian.update({ where: { id: guardianId }, data: { addressId } });
      await deleteIfOrphan(tx, previousId);
    }
    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "UPDATE",
        entityType: "Guardian",
        entityId: guardianId,
        afterData: { section: "address", shared: "sameAsStudentId" in command },
      },
    });
    const address = addressId
      ? await tx.address.findUniqueOrThrow({ where: { id: addressId }, select: addressSelect })
      : null;
    return { address: publicAddress(address) };
  });
}

/** Dirección del alumno ya formateada, para la ficha de inscripción y su PDF. */
export async function studentFormattedAddress(client: Client, studentId: string) {
  const student = await client.student.findUnique({
    where: { id: studentId },
    select: { address: { select: addressSelect } },
  });
  return formatAddress(student?.address);
}
