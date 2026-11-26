//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
type ByteReader = (file: Blob) => Promise<ArrayBuffer>;

function read_with_array_buffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer !== "function") {
    return Promise.reject(new Error("array_buffer_unavailable"));
  }

  return file.arrayBuffer();
}

function read_with_response(file: Blob): Promise<ArrayBuffer> {
  if (typeof Response !== "function") {
    return Promise.reject(new Error("response_unavailable"));
  }

  return new Response(file).arrayBuffer();
}

function read_with_file_reader(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== "function") {
      reject(new Error("file_reader_unavailable"));

      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.onabort = () => reject(new Error("read_aborted"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("read_failed"));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

const BYTE_READERS: ByteReader[] = [
  read_with_array_buffer,
  read_with_response,
  read_with_file_reader,
];

export async function read_file_bytes(file: Blob): Promise<ArrayBuffer> {
  let last_error: unknown = new Error("read_failed");

  for (const read of BYTE_READERS) {
    try {
      return await read(file);
    } catch (error) {
      last_error = error;
    }
  }

  throw last_error;
}
