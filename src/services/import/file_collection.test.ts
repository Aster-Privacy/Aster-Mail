import { describe, it, expect } from "vitest";

import {
  collect_files_from_data_transfer,
  filter_supported_files,
  is_supported_import_file,
} from "./file_collection";

function file_entry(name: string) {
  const file = new File(["body"], name, { type: "message/rfc822" });

  return {
    isFile: true,
    isDirectory: false,
    file: (ok: (f: File) => void) => ok(file),
  };
}

function dir_entry(children: ReturnType<typeof file_entry>[], batch = 100) {
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let offset = 0;

      return {
        readEntries: (ok: (entries: unknown[]) => void) => {
          const slice = children.slice(offset, offset + batch);

          offset += slice.length;
          ok(slice);
        },
      };
    },
  };
}

function data_transfer_for(root: unknown): DataTransfer {
  const item = {
    kind: "file",
    type: "",
    webkitGetAsEntry: () => root,
    getAsFile: () => null,
  };

  return {
    items: [item],
    files: [],
  } as unknown as DataTransfer;
}

describe("file_collection", () => {
  it("is_supported_import_file matches eml and rejects junk", () => {
    expect(is_supported_import_file("message.eml")).toBe(true);
    expect(is_supported_import_file("MESSAGE.EML")).toBe(true);
    expect(is_supported_import_file("archive.mbox")).toBe(true);
    expect(is_supported_import_file(".DS_Store")).toBe(false);
    expect(is_supported_import_file("photo.png")).toBe(false);
  });

  it("collects all 300 files from a dropped directory despite the 100-entry readEntries cap", async () => {
    const children = Array.from({ length: 300 }, (_, i) =>
      file_entry(`message-${i}.eml`),
    );
    const dt = data_transfer_for(dir_entry(children, 100));

    const { files, from_directory } = await collect_files_from_data_transfer(
      dt,
    );

    expect(files.length).toBe(300);
    expect(from_directory).toBe(true);
  });

  it("recurses into nested subdirectories", async () => {
    const sub = dir_entry(
      Array.from({ length: 150 }, (_, i) => file_entry(`sub-${i}.eml`)),
      100,
    );
    const top = {
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let done = false;

        return {
          readEntries: (ok: (entries: unknown[]) => void) => {
            if (done) {
              ok([]);

              return;
            }
            done = true;
            ok([
              file_entry("top.eml"),
              sub,
              file_entry("ignored.png"),
            ]);
          },
        };
      },
    };
    const dt = data_transfer_for(top);

    const { files } = await collect_files_from_data_transfer(dt);
    const supported = filter_supported_files(files);

    expect(files.length).toBe(152);
    expect(supported.length).toBe(151);
  });

  it("reports from_directory false for individually dropped files (no junk filtering)", async () => {
    const item = (name: string) => {
      const file = new File(["body"], name, { type: "" });

      return {
        kind: "file",
        type: "",
        webkitGetAsEntry: () => ({
          isFile: true,
          isDirectory: false,
          file: (ok: (f: File) => void) => ok(file),
        }),
        getAsFile: () => file,
      };
    };
    const dt = {
      items: [item("mailbox-export"), item("notes.eml")],
      files: [],
    } as unknown as DataTransfer;

    const { files, from_directory } = await collect_files_from_data_transfer(
      dt,
    );

    expect(from_directory).toBe(false);
    expect(files.length).toBe(2);
  });

  it("falls back to data_transfer.files when entries API is absent", async () => {
    const dt = {
      items: [{ kind: "file", type: "message/rfc822" }],
      files: [new File(["x"], "a.eml")],
    } as unknown as DataTransfer;

    const { files, from_directory } = await collect_files_from_data_transfer(
      dt,
    );

    expect(files.length).toBe(1);
    expect(from_directory).toBe(false);
  });
});
