const generatedImageEntityRevision = ref(0);

export function useGeneratedImageEntityRevision() {
  return generatedImageEntityRevision;
}

export function bumpGeneratedImageEntityRevision() {
  generatedImageEntityRevision.value += 1;
}
