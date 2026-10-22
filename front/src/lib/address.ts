import type { Address, AddressInput } from '../api/addresses.ts';

export const emptyAddress: AddressInput = {
  fullAddress: null,
  lot: null,
  block: null,
  sector: null,
  zone: null,
  neighborhood: null,
  village: null,
  municipality: null,
  department: null,
  country: 'Guatemala',
  reference: null,
};

/** Copia solo los campos editables de una dirección guardada (sin id ni formatted). */
export function toAddressInput(address: Address | null): AddressInput {
  if (!address) return { ...emptyAddress };
  return Object.fromEntries(
    (Object.keys(emptyAddress) as Array<keyof AddressInput>).map((field) => [field, address[field]]),
  ) as AddressInput;
}
