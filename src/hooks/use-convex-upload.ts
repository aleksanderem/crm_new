import { useCallback, useState } from "react";

export type UploadedFile = {
  file: File;
  response: unknown;
};

type Options = {
  onUploadComplete?: (uploaded: UploadedFile[]) => Promise<void> | void;
  onUploadError?: (error: unknown) => void;
  onUploadBegin?: (fileName: string) => void;
};

export function useConvexUpload(
  generateUploadUrl: () => Promise<string>,
  options?: Options,
) {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = useCallback(
    async (files: File[]): Promise<UploadedFile[]> => {
      setIsUploading(true);
      try {
        const uploaded = await Promise.all(
          files.map(async (file) => {
            options?.onUploadBegin?.(file.name);
            const url = await generateUploadUrl();
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });
            if (!response.ok) {
              throw new Error(`Upload failed: ${response.statusText}`);
            }
            return { file, response: await response.json() };
          }),
        );
        await options?.onUploadComplete?.(uploaded);
        return uploaded;
      } catch (e) {
        options?.onUploadError?.(e);
        return [];
      } finally {
        setIsUploading(false);
      }
    },
    [generateUploadUrl, options],
  );

  return { startUpload, isUploading };
}
