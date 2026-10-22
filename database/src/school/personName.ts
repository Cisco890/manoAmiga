/** Utilidades para nombres de persona separados (nombres + apellidos). */

export type PersonNameParts = {
  givenNames: string;
  firstSurname: string;
  secondSurname?: string | null;
};

export function buildFullName(
  givenNames: string | null | undefined,
  firstSurname: string | null | undefined,
  secondSurname?: string | null,
) {
  return [givenNames, firstSurname, secondSurname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function buildSearchName(
  givenNames: string,
  firstSurname: string,
  secondSurname?: string | null,
) {
  return buildFullName(givenNames, firstSurname, secondSurname);
}

export function publicPersonName(parts: {
  givenNames: string | null | undefined;
  firstSurname: string | null | undefined;
  secondSurname?: string | null;
}) {
  return {
    givenNames: parts.givenNames ?? null,
    firstSurname: parts.firstSurname ?? null,
    secondSurname: parts.secondSurname ?? null,
    fullName: buildFullName(parts.givenNames, parts.firstSurname, parts.secondSurname) || null,
  };
}
