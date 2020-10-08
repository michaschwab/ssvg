let safeLogCount = 0;

export function safeLog(...logContents) {
    if (safeLogCount < 200) {
        safeLogCount++;
        console.log(...logContents);
    }
}
export function safeErrorLog(...logContents) {
    if (safeLogCount < 200) {
        safeLogCount++;
        console.error(...logContents);
    }
}
