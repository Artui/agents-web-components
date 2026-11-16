import type { ComponentRenderer } from "../core/component_renderer.js";
import { button } from "./button.js";
import { checkBox } from "./check_box.js";
import { choicePicker } from "./choice_picker.js";
import { textField } from "./text_field.js";

/** Button, TextField, CheckBox and ChoicePicker, by catalog name. */
export const INPUT_COMPONENTS: Readonly<Record<string, ComponentRenderer>> = {
  Button: button,
  TextField: textField,
  CheckBox: checkBox,
  ChoicePicker: choicePicker,
};
