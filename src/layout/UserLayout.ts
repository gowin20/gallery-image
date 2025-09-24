import { Layout, type LayoutOptions } from "./Layout.js";

type ArtistId = string;
type ArtistLayoutOptions = LayoutOptions & {
    userId: ArtistId;
}

class ArtistLayout extends Layout {

};