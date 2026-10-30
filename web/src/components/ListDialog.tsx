import { useState } from "react";
import { local, uid, useItems, useT } from "../lib/app";
import { trashTask } from "../lib/tasks";
import { Button, ColorPicker, Dialog, Field, inputCls } from "./ui";

type Kind = "list" | "tag" | "folder";

/** Create or edit a list, tag or folder. `item` undefined = create. */
export function ListDialog({
  kind, item, onClose, onDeleted,
}: { kind: Kind; item?: { id: string; name: string; color?: string; folderId?: string | null }; onClose: () => void; onDeleted?: () => void }) {
  const t = useT();
  const folders = useItems("folder");
  const tasks = useItems("task");
  const [name, setName] = useState(item?.name ?? "");
  const [color, setColor] = useState(item?.color ?? "indigo");
  const [folderId, setFolderId] = useState(item?.folderId ?? "");

  async function save() {
    const n = name.trim();
    if (!n) return;
    const id = item?.id ?? uid();
    if (kind === "list") await local.patch("list", id, { name: n, color, folderId: folderId || null, ...(item ? {} : { order: Date.now() }) });
    else if (kind === "tag") await local.patch("tag", id, { name: n, color });
    else await local.patch("folder", id, { name: n, ...(item ? {} : { order: Date.now() }) });
    onClose();
    if (!item && kind === "list") location.hash = `/list/${id}`;
  }

  async function remove() {
    if (!item || !confirm(kind === "list" ? t("deleteListConfirm") : t("confirmDelete"))) return;
    if (kind === "list") {
      for (const x of tasks.filter((x) => x.listId === item.id && x.trashedAt === null)) await trashTask(x.id);
      await local.remove("list", item.id);
    } else if (kind === "tag") {
      for (const x of tasks.filter((x) => x.tags.includes(item.id))) await local.patch("task", x.id, { tags: x.tags.filter((g) => g !== item.id) });
      await local.remove("tag", item.id);
    } else {
      for (const l of (await local.all("list")).filter((l) => l.folderId === item.id)) await local.patch("list", l.id, { folderId: null });
      await local.remove("folder", item.id);
    }
    onClose();
    onDeleted?.();
    location.hash = "/today";
  }

  const heading = item ? t("edit") : kind === "list" ? t("newList") : kind === "tag" ? t("newTag") : t("newFolder");
  return (
    <Dialog title={heading} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("name")}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
        </Field>
        {kind !== "folder" && <Field label={t("color")}><ColorPicker value={color} onChange={setColor} /></Field>}
        {kind === "list" && folders.length > 0 && (
          <Field label={t("folder")}>
            <select className={inputCls} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">–</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        <div className="flex justify-between pt-1">
          {item ? <Button variant="danger" onClick={() => void remove()}>{t("delete")}</Button> : <span />}
          <div className="flex gap-2">
            <Button onClick={onClose}>{t("cancel")}</Button>
            <Button variant="primary" onClick={() => void save()}>{t("save")}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
