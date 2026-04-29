type ZipEntryInput = {
  name: string;
  content: string | Uint8Array;
  modifiedAt?: Date;
};

type ZipPreparedEntry = {
  centralHeader: Uint8Array;
  localHeader: Uint8Array;
  content: Uint8Array;
};

const textEncoder = new TextEncoder();
const crcTable = buildCrc32Table();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;

  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint16(offset, value, true);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint32(offset, value, true);
}

function toDosDateTime(input: Date): { date: number; time: number } {
  const year = Math.max(1980, input.getFullYear());
  const month = input.getMonth() + 1;
  const day = input.getDate();
  const hours = input.getHours();
  const minutes = input.getMinutes();
  const seconds = Math.floor(input.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function normalizeBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? textEncoder.encode(content) : content;
}

function prepareEntry(input: ZipEntryInput, localHeaderOffset: number): ZipPreparedEntry {
  const nameBytes = textEncoder.encode(input.name);
  const contentBytes = normalizeBytes(input.content);
  const checksum = crc32(contentBytes);
  const { date, time } = toDosDateTime(input.modifiedAt ?? new Date());
  const flags = 0x0800;

  const localHeader = new Uint8Array(30 + nameBytes.length);
  writeUint32(localHeader, 0, 0x04034b50);
  writeUint16(localHeader, 4, 20);
  writeUint16(localHeader, 6, flags);
  writeUint16(localHeader, 8, 0);
  writeUint16(localHeader, 10, time);
  writeUint16(localHeader, 12, date);
  writeUint32(localHeader, 14, checksum);
  writeUint32(localHeader, 18, contentBytes.byteLength);
  writeUint32(localHeader, 22, contentBytes.byteLength);
  writeUint16(localHeader, 26, nameBytes.length);
  writeUint16(localHeader, 28, 0);
  localHeader.set(nameBytes, 30);

  const centralHeader = new Uint8Array(46 + nameBytes.length);
  writeUint32(centralHeader, 0, 0x02014b50);
  writeUint16(centralHeader, 4, 20);
  writeUint16(centralHeader, 6, 20);
  writeUint16(centralHeader, 8, flags);
  writeUint16(centralHeader, 10, 0);
  writeUint16(centralHeader, 12, time);
  writeUint16(centralHeader, 14, date);
  writeUint32(centralHeader, 16, checksum);
  writeUint32(centralHeader, 20, contentBytes.byteLength);
  writeUint32(centralHeader, 24, contentBytes.byteLength);
  writeUint16(centralHeader, 28, nameBytes.length);
  writeUint16(centralHeader, 30, 0);
  writeUint16(centralHeader, 32, 0);
  writeUint16(centralHeader, 34, 0);
  writeUint16(centralHeader, 36, 0);
  writeUint32(centralHeader, 38, 0);
  writeUint32(centralHeader, 42, localHeaderOffset);
  centralHeader.set(nameBytes, 46);

  return {
    centralHeader,
    localHeader,
    content: contentBytes,
  };
}

export function createZipArchive(entries: ZipEntryInput[]): ArrayBuffer {
  const preparedEntries: ZipPreparedEntry[] = [];
  let localSectionLength = 0;

  for (const entry of entries) {
    const preparedEntry = prepareEntry(entry, localSectionLength);
    preparedEntries.push(preparedEntry);
    localSectionLength += preparedEntry.localHeader.byteLength + preparedEntry.content.byteLength;
  }

  const centralDirectoryLength = preparedEntries.reduce(
    (sum, entry) => sum + entry.centralHeader.byteLength,
    0,
  );
  const archive = new Uint8Array(localSectionLength + centralDirectoryLength + 22);

  let offset = 0;
  for (const entry of preparedEntries) {
    archive.set(entry.localHeader, offset);
    offset += entry.localHeader.byteLength;
    archive.set(entry.content, offset);
    offset += entry.content.byteLength;
  }

  const centralDirectoryOffset = offset;
  for (const entry of preparedEntries) {
    archive.set(entry.centralHeader, offset);
    offset += entry.centralHeader.byteLength;
  }

  const endOfCentralDirectory = new Uint8Array(22);
  writeUint32(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16(endOfCentralDirectory, 4, 0);
  writeUint16(endOfCentralDirectory, 6, 0);
  writeUint16(endOfCentralDirectory, 8, preparedEntries.length);
  writeUint16(endOfCentralDirectory, 10, preparedEntries.length);
  writeUint32(endOfCentralDirectory, 12, centralDirectoryLength);
  writeUint32(endOfCentralDirectory, 16, centralDirectoryOffset);
  writeUint16(endOfCentralDirectory, 20, 0);
  archive.set(endOfCentralDirectory, offset);

  return archive.buffer;
}
