declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, string>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<{
      proof: {
        pi_a: string[]
        pi_b: string[][]
        pi_c: string[]
      }
      publicSignals: string[]
    }>
  }
}

declare module 'circomlibjs' {
  export function buildBabyjub(): Promise<{
    Base8: [bigint, bigint]
    order: bigint
    mulPointEscalar(p: [bigint, bigint], s: bigint): [bigint, bigint]
    F: {
      e(n: bigint | string | number): bigint
      toString(n: bigint, radix?: number): string
    }
  }>

  export function buildPoseidon(): Promise<{
    (inputs: (bigint | string | number)[]): Uint8Array
    F: {
      toString(n: Uint8Array | bigint): string
    }
  }>
}
