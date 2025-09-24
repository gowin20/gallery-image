import { Layout, type LayoutOptions } from "./Layout.js";
import type { LayoutId } from "../gallery-image.js";

type UserId = string;
type UserLayoutOptions = LayoutOptions & {
    userId: UserId;
}


type RandomLayoutId = 'RANDOM';
type LayoutTemplate = Array<Array<LayoutId | RandomLayoutId>>;

type CustomLayoutOptions = LayoutOptions & {
    randomSample: boolean;
    template?: LayoutTemplate;
}

class CustomLayout extends Layout {

};