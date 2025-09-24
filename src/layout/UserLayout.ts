import { Layout, type LayoutOptions, type LayoutId } from "./Layout.js";

type ArtistId = string;
type ArtistLayoutOptions = LayoutOptions & {
    userId: ArtistId;
}

class ArtistLayout extends Layout {

};