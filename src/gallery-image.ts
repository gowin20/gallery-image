import { Layout } from "./layout/Layout.js";
import { Art } from "./Art.js";

import packageInfo from '../package.json' with {type:'json'};

const version = packageInfo.version;

export {
    Layout,
    Art,
    version as VERSION
}