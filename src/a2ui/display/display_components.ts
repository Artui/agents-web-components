import type { ComponentRenderer } from "../core/component_renderer.js";
import { renderCard } from "./render_card.js";
import { renderColumn } from "./render_column.js";
import { renderDivider } from "./render_divider.js";
import { renderIcon } from "./render_icon.js";
import { renderImage } from "./render_image.js";
import { renderList } from "./render_list.js";
import { renderRow } from "./render_row.js";
import { renderText } from "./render_text.js";

/** Text, Image, Icon, Row, Column, List, Card and Divider, by catalog name. */
export const DISPLAY_COMPONENTS: Readonly<Record<string, ComponentRenderer>> = {
  Text: renderText,
  Image: renderImage,
  Icon: renderIcon,
  Row: renderRow,
  Column: renderColumn,
  List: renderList,
  Card: renderCard,
  Divider: renderDivider,
};
