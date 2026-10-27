interface Grid {
  column: number; row: number; width: number; height: number; stepX: number; stepY: number
  pixels: Uint8ClampedArray
}

/** A bounded window of world-aligned samples. Camera motion only evaluates
 * entering rows/columns; light/occluder changes invalidate the whole window. */
export class EnvironmentTerrainField {
  private grid?: Grid
  private spare?: Uint8ClampedArray
  private revision?: object

  update(revision: object, x: number, y: number, columns: number, rows: number, stepX: number, stepY: number, sample: (x: number, y: number) => number) {
    const column = Math.floor(x / stepX) - 1, row = Math.floor(y / stepY) - 1, width = columns + 2, height = rows + 2
    const before = this.grid, reusable = this.revision === revision && before?.width === width && before.height === height && before.stepX === stepX && before.stepY === stepY
    if (reusable && before.column === column && before.row === row) return before
    const pixels = this.spare?.length === width * height * 4 ? this.spare : new Uint8ClampedArray(width * height * 4)
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
      const oldX = c + column - (before?.column ?? 0), oldY = r + row - (before?.row ?? 0)
      const value = reusable && oldX >= 0 && oldX < width && oldY >= 0 && oldY < height
        ? before.pixels[(oldY * width + oldX) * 4] : Math.round(sample((column + c + .5) * stepX, (row + r + .5) * stepY) * 255)
      const index = (r * width + c) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value; pixels[index + 3] = 255
    }
    this.spare = before?.pixels; this.revision = revision
    return this.grid = { column, row, width, height, stepX, stepY, pixels }
  }

  clear() { this.grid = undefined; this.spare = undefined; this.revision = undefined }
}
