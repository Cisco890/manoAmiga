import type { DocumentStatus, DocumentType } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { maxAuthorizedPickups, pickupSelect } from "./authorizedPickups";
import { buildFullName } from "./personName";
import { currentEnrollmentOrder, getStudent } from "./students";

const documentTypes: DocumentType[] = ["ENROLLMENT_FORM", "STUDENT_ID_CARD", "SPONSOR_AUTHORIZATION"];
const documentSelect = { id: true, type: true, status: true, generatedAt: true } as const;
type SummaryDocument = { id: string; type: DocumentType; status: DocumentStatus; generatedAt: Date };

function documentSummary(documents: SummaryDocument[], types = documentTypes) {
  return types.map((type) => {
    const matches = documents.filter((doc) => doc.type === type).sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
    const document = matches.find((doc) => doc.status !== "VOID") ?? matches[0];
    return { type, status: document?.status ?? "MISSING", id: document?.id ?? null, generatedAt: document?.generatedAt ?? null };
  });
}

export async function getStudentSummary(schoolId: string, studentId: string) {
  const student = await getStudent(schoolId, studentId);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const row = await prisma.student.findFirstOrThrow({
    where: { id: studentId, schoolId, deletedAt: null },
    select: {
      photos: { where: { isActive: true }, take: 1, orderBy: { capturedAt: "desc" },
        select: { id: true, capturedAt: true } },
      authorizedPickups: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: pickupSelect },
      guardianLinks: {
        where: { active: true, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }],
          guardian: { active: true, deletedAt: null } },
        orderBy: [{ primaryContact: "desc" }, { legalRepresentative: "desc" }, { createdAt: "asc" }],
        select: { relationship: true, customRelationship: true, primaryContact: true, legalRepresentative: true,
          guardian: { select: { id: true, givenNames: true, firstSurname: true, secondSurname: true, mobilePhone: true, homePhone: true } } },
      },
      sponsorships: {
        where: { status: "ACTIVE", startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }],
          sponsor: { active: true, deletedAt: null } },
        orderBy: { startDate: "desc" },
        select: { id: true, startDate: true, endDate: true,
          sponsor: { select: { id: true, type: true, givenNames: true, firstSurname: true, secondSurname: true, organizationName: true } },
          documents: { select: documentSelect },
        },
      },
      enrollments: {
        orderBy: currentEnrollmentOrder,
        select: {
          id: true, status: true, requestDate: true, approvedAt: true, createdAt: true,
          messageContactGivenNames: true, messageContactFirstSurname: true, messageContactSecondSurname: true,
          messageContactRelationship: true, messageContactPhone: true,
          academicCycle: { select: { id: true, name: true, year: true, status: true } },
          grade: { select: { id: true, name: true, code: true } },
          authorizedPickups: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: pickupSelect },
          documents: { select: documentSelect },
        },
      },
    },
  });
  const current = row.enrollments.find((e) => !["CLOSED", "CANCELLED", "REJECTED"].includes(e.status) && e.academicCycle.status !== "CLOSED");
  const guardians = row.guardianLinks.map((link) => ({
    id: link.guardian.id,
    fullName: buildFullName(link.guardian.givenNames, link.guardian.firstSurname, link.guardian.secondSurname),
    relationship: link.relationship, customRelationship: link.customRelationship,
    phone: link.guardian.mobilePhone ?? link.guardian.homePhone,
    primaryContact: link.primaryContact, legalRepresentative: link.legalRepresentative,
  }));
  const contactName = current && buildFullName(current.messageContactGivenNames, current.messageContactFirstSurname, current.messageContactSecondSurname);
  return {
    student,
    photo: row.photos[0] ?? null,
    currentEnrollment: current ? { id: current.id, status: current.status, grade: current.grade, academicCycle: current.academicCycle } : null,
    responsible: guardians[0] ?? (contactName ? {
      id: null, fullName: contactName, relationship: "ENROLLMENT_CONTACT", customRelationship: current!.messageContactRelationship,
      phone: current!.messageContactPhone, primaryContact: false, legalRepresentative: false,
    } : null),
    guardians,
    sponsors: row.sponsorships.map((s) => ({
      id: s.sponsor.id, sponsorshipId: s.id, startDate: s.startDate.toISOString().slice(0, 10),
      fullName: s.sponsor.organizationName || buildFullName(s.sponsor.givenNames, s.sponsor.firstSurname, s.sponsor.secondSurname),
    })),
    authorizedPickups: row.authorizedPickups,
    maxAuthorizedPickups,
    documents: documentSummary([...(current?.documents ?? []), ...row.sponsorships.flatMap((s) => s.documents)]),
    history: row.enrollments.map((e) => ({
      id: e.id, status: e.status, academicCycle: e.academicCycle, grade: e.grade,
      requestDate: e.requestDate.toISOString().slice(0, 10), approvedAt: e.approvedAt,
      isCurrent: e.id === current?.id, authorizedPickups: e.authorizedPickups,
      documents: documentSummary(e.documents, ["ENROLLMENT_FORM", "STUDENT_ID_CARD"]),
    })),
  };
}

export async function getStudentPhoto(schoolId: string, studentId: string) {
  const photo = await prisma.studentPhoto.findFirst({
    where: { studentId, isActive: true, student: { schoolId, deletedAt: null } },
    orderBy: { capturedAt: "desc" }, select: { storagePath: true, mimeType: true },
  });
  if (!photo) throw Object.assign(new Error("Fotografía no encontrada"), { status: 404 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(photo.mimeType)) {
    throw Object.assign(new Error("Formato de fotografía no compatible"), { status: 415 });
  }
  return photo;
}
