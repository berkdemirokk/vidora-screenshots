import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MAX_CUE_WORDS, MAX_WORD_LENGTH, type PlacedCue } from "./captions";
import { formatTime } from "./project-state";
import { Button, Field, MaxScale, Space, Theme, s, useT } from "./ui";

const PAGE = 30;
const cueText = (placed: PlacedCue) =>
  placed.cue.words.map((word) => word.text).join(" ");

/**
 * Caption lines in playback order as plain rows; tap one to fix its text
 * (Return saves) or delete it. A deleted line leaves "Satır silindi · Geri al".
 */
export function CueList({
  cues,
  disabled,
  onEdit,
  onDelete,
  undo,
}: {
  cues: PlacedCue[];
  disabled: boolean;
  onEdit: (index: number, text: string) => void;
  onDelete: (index: number) => void;
  /** Set right after a deletion: where the line was and how to bring it back. */
  undo: { index: number; onUndo: () => void } | null;
}) {
  const t = useT();
  const [editing, setEditing] = useState<{
    index: number;
    draft: string;
  } | null>(null);
  const [shown, setShown] = useState(PAGE);
  // Any change to the cues (edit, style, trim) invalidates the open editor.
  useEffect(() => setEditing(null), [cues]);

  function save(index: number, text: string, draft: string) {
    const clean = draft.trim();
    setEditing(null);
    if (clean && clean.split(/\s+/).join(" ") !== text) onEdit(index, clean);
  }

  const undoRow = (
    <View key="undo" style={[styles.row, styles.undo]}>
      <Text maxFontSizeMultiplier={MaxScale.chrome} style={s.footnote}>
        {t("Satır silindi", "Line deleted")}
      </Text>
      <Button
        plain
        testID="desk-cue-undo"
        label={t("Geri al", "Undo")}
        disabled={disabled}
        onPress={() => undo?.onUndo()}
      />
    </View>
  );

  if (!cues.length)
    return (
      <View>
        {undo && undoRow}
        <Text style={[s.footnote, styles.padded]}>
          {t(
            "Seçili kırpma aralığında altyazı yok.",
            "There are no captions inside the current trim.",
          )}
        </Text>
      </View>
    );
  const rows = cues.slice(0, shown).map((placed, index) => {
    const text = cueText(placed);
    const range =
      formatTime(placed.cue.start) + " – " + formatTime(placed.cue.end);
    if (editing?.index === index)
      return (
        <View key={index} style={[styles.padded, styles.editor]}>
          <Field
            label={t("Altyazı metni · ", "Caption text · ") + range}
            value={editing.draft}
            maxLength={MAX_CUE_WORDS * (MAX_WORD_LENGTH + 1)}
            autoFocus
            autoCorrect={false}
            editable={!disabled}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => save(index, text, editing.draft)}
            style={[s.input, { backgroundColor: Theme.raised }]}
            onChangeText={(draft) => setEditing({ index, draft })}
          />
          <View style={styles.editButtons}>
            <Button
              testID="desk-cue-save"
              label={t("Kaydet", "Save")}
              disabled={disabled || !editing.draft.trim()}
              onPress={() => save(index, text, editing.draft)}
            />
            <Button
              plain
              label={t("Vazgeç", "Cancel")}
              onPress={() => setEditing(null)}
            />
            <View style={{ flex: 1 }} />
            <Button
              plain
              danger
              testID="desk-cue-delete"
              label={t("Satırı sil", "Delete line")}
              accessibilityLabel={
                t("Altyazı satırını sil: ", "Delete caption line: ") + text
              }
              disabled={disabled}
              onPress={() => {
                setEditing(null);
                onDelete(index);
              }}
            />
          </View>
        </View>
      );
    return (
      <Pressable
        key={index}
        testID={"desk-cue-" + (index + 1)}
        accessibilityRole="button"
        accessibilityLabel={
          t("Altyazıyı düzenle: ", "Edit caption: ") + text + ", " + range
        }
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setEditing({ index, draft: text })}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: Theme.pressed },
        ]}
      >
        <View style={[styles.rowBody, index > 0 && styles.line]}>
          <Text
            maxFontSizeMultiplier={MaxScale.chrome}
            style={[s.footnote, { fontVariant: ["tabular-nums"] }]}
          >
            {range}
          </Text>
          <Text style={s.text}>{text}</Text>
        </View>
      </Pressable>
    );
  });
  if (undo) rows.splice(Math.min(undo.index, rows.length), 0, undoRow);
  return (
    <View>
      {rows}
      {cues.length > shown && (
        <View style={[styles.padded, { paddingTop: Space.s }]}>
          <Button
            label={t(
              `Daha fazla göster (${cues.length - shown})`,
              `Show more (${cues.length - shown})`,
            )}
            onPress={() => setShown(shown + PAGE)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: Space.gutter },
  row: { paddingLeft: Space.gutter },
  rowBody: {
    minHeight: 56,
    justifyContent: "center",
    gap: 2,
    paddingVertical: Space.s,
    paddingRight: Space.gutter,
  },
  line: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  undo: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: Space.gutter,
  },
  editor: { gap: Space.s, paddingVertical: Space.s },
  editButtons: { flexDirection: "row", alignItems: "center", gap: Space.l },
});
