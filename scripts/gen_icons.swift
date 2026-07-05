// Generates the app / tray icon PNGs from the handoff geometry.
// Usage: swift scripts/gen_icons.swift <outdir>
//   appicon-1024.png      — dock tile (light variant, rings at the mock's 75% / 65%)
//   tray-normal.png       — 36px (18pt @2x) template outline glyph
//   tray-alert-light.png  — filled glyph + red badge, for light menu bars
//   tray-alert-dark.png   — filled glyph + red badge, for dark menu bars

import AppKit

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func render(_ px: Int, _ draw: (CGContext) -> Void) -> Data {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ctx
    let cg = ctx.cgContext
    cg.translateBy(x: 0, y: CGFloat(px))   // top-left origin, like SVG
    cg.scaleBy(x: 1, y: -1)
    draw(cg)
    cg.flush()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

func save(_ data: Data, _ name: String) {
    try! data.write(to: URL(fileURLWithPath: outDir + "/" + name))
    print("wrote \(outDir)/\(name)")
}

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
}

// ring arc starting at 12 o'clock, clockwise (context is y-flipped)
func ring(_ cg: CGContext, cx: CGFloat, cy: CGFloat, r: CGFloat, width: CGFloat, frac: CGFloat, stroke: CGColor) {
    guard frac > 0 else { return }
    cg.saveGState()
    cg.setLineCap(.round)
    cg.setLineWidth(width)
    cg.setStrokeColor(stroke)
    cg.addArc(center: CGPoint(x: cx, y: cy), radius: r,
              startAngle: -.pi / 2, endAngle: -.pi / 2 + frac * 2 * .pi, clockwise: false)
    cg.strokePath()
    cg.restoreGState()
}

// ---- Dock tile (128 viewBox, light variant) ----
func dockTile(_ px: Int) -> Data {
    render(px) { cg in
        let s = CGFloat(px) / 128
        cg.scaleBy(x: s, y: s)

        let tile = CGPath(roundedRect: CGRect(x: 7, y: 7, width: 114, height: 114),
                          cornerWidth: 26, cornerHeight: 26, transform: nil)
        cg.saveGState()
        cg.addPath(tile)
        cg.clip()
        let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                              colors: [color(0xFFFFFF), color(0xE7F2F4)] as CFArray,
                              locations: [0, 1])!
        cg.drawLinearGradient(grad, start: CGPoint(x: 64, y: 7), end: CGPoint(x: 64, y: 121), options: [])
        cg.restoreGState()

        cg.addPath(CGPath(roundedRect: CGRect(x: 7.5, y: 7.5, width: 113, height: 113),
                          cornerWidth: 25.5, cornerHeight: 25.5, transform: nil))
        cg.setStrokeColor(color(0x142D37, 0.10))
        cg.setLineWidth(1)
        cg.strokePath()

        let track = color(0x142D37, 0.09)
        let accent = color(0x63EBE9)
        // outer = sitting (mock: 75%), inner = water (mock: 65%)
        ring(cg, cx: 64, cy: 64, r: 38, width: 10, frac: 1, stroke: track)
        ring(cg, cx: 64, cy: 64, r: 38, width: 10, frac: 0.75, stroke: accent)
        ring(cg, cx: 64, cy: 64, r: 22, width: 8, frac: 1, stroke: track)
        // inner ring gradient approximated with accentLite (#B1F5F4) midpoint
        ring(cg, cx: 64, cy: 64, r: 22, width: 8, frac: 0.65, stroke: color(0x8AF0EE))

        // center standing figure (#dpG)
        let fig = color(0x142D37, 0.75)
        cg.setFillColor(fig)
        cg.fillEllipse(in: CGRect(x: 64 - 4.4, y: 54 - 4.4, width: 8.8, height: 8.8))
        cg.setStrokeColor(fig)
        cg.setLineWidth(3.4)
        cg.setLineCap(.round)
        for (a, b) in [(CGPoint(x: 64, y: 60.5), CGPoint(x: 64, y: 70)),
                       (CGPoint(x: 64, y: 63.5), CGPoint(x: 58, y: 58.5)),
                       (CGPoint(x: 64, y: 63.5), CGPoint(x: 70, y: 58.5)),
                       (CGPoint(x: 64, y: 70),   CGPoint(x: 59, y: 77.5)),
                       (CGPoint(x: 64, y: 70),   CGPoint(x: 69, y: 77.5))] {
            cg.move(to: a); cg.addLine(to: b); cg.strokePath()
        }
    }
}

// ---- Menu-bar glyphs (18 viewBox rendered at @2x = 36px) ----
func trayNormal() -> Data {
    render(36) { cg in
        cg.scaleBy(x: 2, y: 2)
        cg.setStrokeColor(color(0x000000))
        cg.setLineWidth(1.5)
        cg.strokeEllipse(in: CGRect(x: 9 - 6.4, y: 9 - 6.4, width: 12.8, height: 12.8))
        cg.strokeEllipse(in: CGRect(x: 9 - 2.6, y: 9 - 2.6, width: 5.2, height: 5.2))
        cg.setFillColor(color(0x000000))
        cg.fillEllipse(in: CGRect(x: 9 - 0.6, y: 9 - 0.6, width: 1.2, height: 1.2))
    }
}

func trayAlert(glyph: UInt32) -> Data {
    render(36) { cg in
        cg.scaleBy(x: 2, y: 2)
        // filled ring glyph with knocked-out core
        cg.setFillColor(color(glyph))
        cg.fillEllipse(in: CGRect(x: 9 - 6.4, y: 9 - 6.4, width: 12.8, height: 12.8))
        cg.setBlendMode(.clear)
        cg.fillEllipse(in: CGRect(x: 9 - 2.6, y: 9 - 2.6, width: 5.2, height: 5.2))
        // badge: transparent halo (1.5) then red dot (⌀9) at top-right
        cg.fillEllipse(in: CGRect(x: 13.5 - 6, y: 4.5 - 6, width: 12, height: 12))
        cg.setBlendMode(.normal)
        cg.setFillColor(color(0xFF453A))
        cg.fillEllipse(in: CGRect(x: 13.5 - 4.5, y: 4.5 - 4.5, width: 9, height: 9))
    }
}

save(dockTile(1024), "appicon-1024.png")
save(trayNormal(), "tray-normal.png")
save(trayAlert(glyph: 0x000000), "tray-alert-light.png")
save(trayAlert(glyph: 0xFFFFFF), "tray-alert-dark.png")
