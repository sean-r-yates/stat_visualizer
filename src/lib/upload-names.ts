export function createUniqueStoredName(
  originalName: string,
  existingNames: Set<string>,
): string {
  const trimmedName = originalName.trim() || "submission.py";
  const extensionIndex = trimmedName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? trimmedName.slice(0, extensionIndex) : trimmedName;
  const extension = hasExtension ? trimmedName.slice(extensionIndex) : "";

  let candidate = `${baseName}${extension}`;
  let suffix = 1;

  while (existingNames.has(candidate)) {
    candidate = `${baseName} (${suffix})${extension}`;
    suffix += 1;
  }

  existingNames.add(candidate);
  return candidate;
}
