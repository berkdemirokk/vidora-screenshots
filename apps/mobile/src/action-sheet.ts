import { ActionSheetIOS, type ActionSheetIOSOptions } from "react-native";
import { createSheetGate } from "./action-sheet-gate";

const gate = createSheetGate(() => performance.now());

/**
 * The only place that calls ActionSheetIOS (action-sheet.test.mjs): two
 * calls close together present ONE sheet; the second is dropped, as a
 * second tap on the same screen would be. See action-sheet-gate.ts.
 */
export function showActionSheet(
  options: ActionSheetIOSOptions,
  onPick: (index: number) => void,
): void {
  const release = gate.acquire();
  if (!release) return;
  ActionSheetIOS.showActionSheetWithOptions(options, (index) => {
    release();
    onPick(index);
  });
}
