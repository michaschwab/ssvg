import SSVG from "./ssvg";

if(!location.search.match(/(\?|&)svg($|&)/)) {
    new SSVG();
}

export = SSVG;