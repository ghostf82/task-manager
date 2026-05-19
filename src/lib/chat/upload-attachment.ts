import { createClient } from "@/lib/supabase/client";

export type UploadedChatAttachment = {
  /** Storage object path (persisted in DB). */
  path: string;
  type: "image" | "audio" | "file";
  name: string;
};

function attachmentTypeFromMime(mime: string, name: string): "image" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(lower)) return "image";
  if (/\.(webm|ogg|mp3|m4a|wav)$/i.test(lower)) return "audio";
  return "file";
}

/** Upload to private `chat-attachments` bucket; returns a signed URL for display. */
export async function uploadChatAttachment(
  conversationId: string,
  userId: string,
  file: File
): Promise<UploadedChatAttachment> {
  const supabase = createClient();
  const safeName = file.name.replace(/[^\w.\-أ-ي]+/gi, "_").slice(0, 120) || "file";
  const path = `${conversationId}/${userId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (error) throw new Error(error.message);

  return {
    path,
    type: attachmentTypeFromMime(file.type, safeName),
    name: file.name || safeName,
  };
}

export async function signedUrlForChatAttachment(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
