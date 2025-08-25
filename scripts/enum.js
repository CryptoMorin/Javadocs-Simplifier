export function createEnum(...values) {
    const object = {};
    let ordered = [];
    let ordinal = 0;

    for (const value of values) {
        const enumValue = {
            ordinal,
            name: value,

            next() {
                return ordered[this.ordinal + 1]
            },

            previous() {
                return ordered[this.ordinal - 1]
            }
        }
        ordered.push(enumValue)
        object[value] = enumValue

        ordinal++
    }

    object.values = ordered;
    return object;
}