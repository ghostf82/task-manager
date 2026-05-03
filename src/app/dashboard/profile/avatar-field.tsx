"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { setAvatarUrlAction } from "@/app/dashboard/profile/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AvatarField({
  userId,
  currentUrl,
}: {
  userId: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => {
    setPreview(currentUrl);
  }, [currentUrl]);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      {preview ? (
        <img
          src={preview}
          alt="صورة المستخدم"
          className="size-24 rounded-full object-cover ring-2 ring-border"
        />
      ) : (
        <div className="flex size-24 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground ring-2 ring-border">
          ؟
        </div>
      )}
      <div className="grid gap-2 text-center sm:text-start">
        <Label htmlFor="avatar">صورة الملف الشخصي</Label>
        <input
          id="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          className="text-muted-foreground max-w-[220px] text-xs file:me-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              toast.error("الحد الأقصى 2 ميجابايت");
              return;
            }
            startTransition(async () => {
              try {
                const supabase = createClient();
                const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
                const path = `${userId}/avatar.${ext}`;
                const { error: upErr } = await supabase.storage
                  .from("avatars")
                  .upload(path, file, { upsert: true, contentType: file.type });
                if (upErr) throw new Error(upErr.message);
                const { data: pub } = supabase.storage
                  .from("avatars")
                  .getPublicUrl(path);
                await setAvatarUrlAction(pub.publicUrl);
                setPreview(pub.publicUrl);
                toast.success("تم تحديث الصورة");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "فشل الرفع");
              }
            });
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:self-start"
          disabled={pending || !(preview ?? currentUrl)}
          onClick={() => {
            startTransition(async () => {
              try {
                await setAvatarUrlAction(null);
                setPreview(null);
                router.refresh();
                toast.success("تمت إزالة الصورة");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "فشل");
              }
            });
          }}
        >
          إزالة الصورة
        </Button>
      </div>
    </div>
  );
}
