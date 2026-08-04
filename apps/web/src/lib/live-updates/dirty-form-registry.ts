const dirtyFormIds = new Set<string>();

export function registerDirtyForm(formId: string): void {
  dirtyFormIds.add(formId);
}

export function unregisterDirtyForm(formId: string): void {
  dirtyFormIds.delete(formId);
}

export function hasDirtyForms(): boolean {
  return dirtyFormIds.size > 0;
}

export function clearDirtyForms(): void {
  dirtyFormIds.clear();
}
