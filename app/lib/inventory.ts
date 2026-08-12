import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";

import { supabase } from "./supabase";
import { apiFetch } from "./api";

const BUCKET = "fridge-photos";
const MAX_EDGE = 1568; // downscale target — balances label legibility vs cost

export type DetectedItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  brand: string | null;
  expiry_date: string | null;
  confidence: number;
};

/** Editable row in the review screen — starts from a DetectedItem. */
export type ReviewItem = {
  name: string;
  quantity: string; // kept as string for TextInput; parsed on save
  unit: string;
  brand: string;
  expiry_date: string;
  confidence: number;
};

/** The quantity field is free text — reject anything that isn't a real number
 * rather than writing NaN into the database. */
function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function randomId(): string {
  // RN-safe UUID-ish; crypto.randomUUID isn't guaranteed on all RN runtimes.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Pick a photo (camera), downscale it, upload to Storage. Returns the path,
 * or null if the user cancelled. */
export async function captureAndUpload(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Permission caméra refusée");

  const shot = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });
  if (shot.canceled) return null;

  const manipulated = await ImageManipulator.manipulateAsync(
    shot.assets[0].uri,
    [{ resize: { width: MAX_EDGE } }],
    {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée");

  const path = `${user.id}/${randomId()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(manipulated.base64!), {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw error;

  return path;
}

/** Call the vision endpoint; returns detected items (nothing written yet). */
export async function detectFromPhoto(storagePath: string): Promise<DetectedItem[]> {
  const result = await apiFetch("/inventory/from-photo", {
    method: "POST",
    body: JSON.stringify({ storage_path: storagePath }),
  });
  return result.items as DetectedItem[];
}

/** Persist the user-confirmed items to inventory_items via Supabase (RLS). */
export async function saveItems(items: ReviewItem[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée");

  const rows = items
    .filter((it) => it.name.trim())
    .map((it) => ({
      profile_id: user.id,
      name: it.name.trim(),
      quantity: parseQuantity(it.quantity),
      unit: it.unit.trim() || null,
      brand: it.brand.trim() || null,
      expiry_date: it.expiry_date.trim() || null,
      source: "photo" as const,
    }));

  if (rows.length === 0) return;
  const { error } = await supabase.from("inventory_items").insert(rows);
  if (error) throw error;
}

/** RGPD: remove the photo from Storage once it's no longer needed. */
export async function deletePhoto(storagePath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

/** Remove a food item — used once it has been cooked or thrown away.
 * Without this the inventory drifts from reality and poisons search,
 * meal plans and the shopping list. */
export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

/** Adjust a single item (quantity correction, expiry date fix). */
export async function updateItem(
  id: string,
  patch: { quantity?: number | null; unit?: string | null; expiry_date?: string | null }
): Promise<void> {
  const { error } = await supabase.from("inventory_items").update(patch).eq("id", id);
  if (error) throw error;
}

export function toReviewItem(d: DetectedItem): ReviewItem {
  return {
    name: d.name ?? "",
    quantity: d.quantity != null ? String(d.quantity) : "",
    unit: d.unit ?? "",
    brand: d.brand ?? "",
    expiry_date: d.expiry_date ?? "",
    confidence: d.confidence,
  };
}
