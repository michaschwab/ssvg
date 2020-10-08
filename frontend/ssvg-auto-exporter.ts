import SSVG from './ssvg';

if (!location.search.match(/(\?|&)svg($|&)/)) {
    window['ssvg'] = new SSVG();
}

export = SSVG;
