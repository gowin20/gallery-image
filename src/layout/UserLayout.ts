import { Layout, type LayoutOptions } from "./Layout.js";
import type { ArtistId } from "../types.js";

type ArtistLayoutOptions = LayoutOptions & {
    userId: ArtistId;
}

class ArtistLayout extends Layout {

};