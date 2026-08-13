import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/ez-icons";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { plateJsonToText } from "@/components/plate-text";

export function NotesTabContent({
  notesData,
  newNote,
  setNewNote,
  isAddingNote,
  setIsAddingNote,
  handleAddNote,
  t,
}: {
  notesData: Array<{ _id: string; content: string; createdAt: number }> | undefined;
  newNote: string;
  setNewNote: (v: string) => void;
  isAddingNote: boolean;
  setIsAddingNote: (v: boolean) => void;
  handleAddNote: () => Promise<void>;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{t("detail.notes.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("detail.notes.descriptionAlt")}
          </p>
        </div>
        <Button
          className="bg-primary"
          onClick={() => setIsAddingNote(true)}
        >
          <Plus className="h-4 w-4 mr-1" variant="stroke" />
          {t("detail.notes.add")}
        </Button>
      </div>

      {isAddingNote && (
        <div className="space-y-2 rounded-lg border p-4">
          <RichTextEditor
            value={newNote}
            onChange={(val) => setNewNote(val ?? "")}
            placeholder={t("detail.notes.placeholderAlt")}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddingNote(false);
                setNewNote("");
              }}
            >
              {t("detail.notes.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!newNote.trim()}
            >
              {t("detail.notes.save")}
            </Button>
          </div>
        </div>
      )}

      {notesData && notesData.length > 0 ? (
        <ul className="space-y-3">
          {notesData.map((note) => (
            <li
              key={note._id}
              className="rounded-lg border p-4 space-y-1"
            >
              <p className="text-sm whitespace-pre-wrap">{plateJsonToText(note.content as string)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString("pl-PL", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        !isAddingNote && (
          <p className="text-sm text-muted-foreground">
            {t("detail.notes.empty")}
          </p>
        )
      )}
    </div>
  );
}
