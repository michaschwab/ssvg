import SetPropertyQueueData from "./set-property-queue-data";
import {VdomNode} from "./vdom";

class CompleteSetPropertyQueueData {
    'raw': SetPropertyQueueData;
    'shared': {
        [attrName: string]: Int32Array
    };
}

export default class SetPropertyQueue {
    private data: CompleteSetPropertyQueueData = {'raw': {}, 'shared': {}};
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'x', 'y'];
    static BUFFER_PRECISION_FACTOR = 10;

    ensureInitialized(attrName: string, useBuffer: boolean) {
        if(attrName === 'class') {
            attrName = 'className';
        }

        if(!useBuffer || this.useSharedArrayFor.indexOf(attrName) === -1) {
            if(!this.data.raw[attrName]) {
                this.data.raw[attrName] = [];
            }
        } else {
            if(!this.data.shared[attrName]) {
                const length = 1000; //Todo use number of elements in vdom
                const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * length);
                const values = new Int32Array(buffer);

                // If values have been previously set without a buffer, transfer them.
                if(this.data.raw[attrName] &&
                    !(this.data.raw[attrName] instanceof SharedArrayBuffer)) {
                    const prevData: string[] = <any> this.data.raw[attrName];

                    prevData.forEach((value, index) => {
                        values[index] = parseFloat(value) * SetPropertyQueue.BUFFER_PRECISION_FACTOR;
                    });
                }

                this.data.raw[attrName] = buffer;
                this.data.shared[attrName] = values;
            }
        }
    }

    set(element: VdomNode|HTMLElement, attrName: string, value: any, useBuffer: boolean) {
        if(attrName === 'class') {
            attrName = 'className';
        }
        if(element['globalElementIndex'] === undefined) {
            console.error('No index', element);
            throw new Error('Element has no index');
        }
        const index = element['globalElementIndex'];
        const storage = useBuffer && this.useSharedArrayFor.indexOf(attrName) !== -1 ? 'shared' : 'raw';
        try {
            if(storage === 'shared') {
                value *= SetPropertyQueue.BUFFER_PRECISION_FACTOR;
            }
            this.data[storage][attrName][index] = value;
        }
        catch(e) {
            console.log(e);
            console.log(this.data, storage, attrName, element, index);
        }
    }

    get(node: VdomNode, attrName: string) {
        const index = node['globalElementIndex'];
        return this.data.raw[attrName][index];
    }

    getData() {
        return this.data.raw;
    }

    clearData() {
        this.data = {'raw': {}, 'shared': {}};
    }
}
