import AppKit
import CoreGraphics

func generateIcon() {
    let sizes = [16, 32, 64, 128, 256, 512, 1024]
    var images: [NSImage] = []

    for size in sizes {
        let s = CGFloat(size)
        let image = NSImage(size: NSSize(width: s, height: s))
        image.lockFocus()

        let ctx = NSGraphicsContext.current!.cgContext

        // Background: dark rounded rectangle
        let bgRect = CGRect(x: 0, y: 0, width: s, height: s)
        let cornerRadius = s * 0.18
        let bgPath = CGPath(roundedRect: bgRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)

        // Gradient background - deep blue to dark
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let gradientColors = [
            CGColor(red: 0.05, green: 0.10, blue: 0.25, alpha: 1.0),
            CGColor(red: 0.02, green: 0.05, blue: 0.15, alpha: 1.0)
        ] as CFArray
        let gradient = CGGradient(colorsSpace: colorSpace, colors: gradientColors, locations: [0.0, 1.0])!

        ctx.saveGState()
        ctx.addPath(bgPath)
        ctx.clip()
        ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: s), end: CGPoint(x: 0, y: 0), options: [])
        ctx.restoreGState()

        // Draw pulse line (ECG/market pulse style)
        let lineWidth = max(s * 0.035, 1.5)
        ctx.setLineWidth(lineWidth)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)

        // Pulse path - a stylized heartbeat/market line
        let pulseY = s * 0.50
        let pulsePoints: [(CGFloat, CGFloat)] = [
            (0.10, 0.50),
            (0.20, 0.50),
            (0.28, 0.50),
            (0.33, 0.65),  // small dip
            (0.38, 0.35),  // up
            (0.42, 0.80),  // big spike down
            (0.46, 0.15),  // big spike up
            (0.50, 0.55),  // back to baseline
            (0.55, 0.50),
            (0.62, 0.45),
            (0.68, 0.38),  // trending up
            (0.75, 0.32),
            (0.82, 0.28),  // peak
            (0.90, 0.35),
        ]

        // Glow effect - draw thicker translucent line first
        ctx.setStrokeColor(CGColor(red: 0.2, green: 0.8, blue: 1.0, alpha: 0.3))
        ctx.setLineWidth(lineWidth * 3)
        ctx.beginPath()
        for (i, point) in pulsePoints.enumerated() {
            let x = point.0 * s
            let y = (1.0 - point.1) * s  // flip Y
            if i == 0 {
                ctx.move(to: CGPoint(x: x, y: y))
            } else {
                ctx.addLine(to: CGPoint(x: x, y: y))
            }
        }
        ctx.strokePath()

        // Main pulse line - cyan/teal
        ctx.setStrokeColor(CGColor(red: 0.2, green: 0.85, blue: 1.0, alpha: 1.0))
        ctx.setLineWidth(lineWidth)
        ctx.beginPath()
        for (i, point) in pulsePoints.enumerated() {
            let x = point.0 * s
            let y = (1.0 - point.1) * s
            if i == 0 {
                ctx.move(to: CGPoint(x: x, y: y))
            } else {
                ctx.addLine(to: CGPoint(x: x, y: y))
            }
        }
        ctx.strokePath()

        // Draw "MP" text at bottom
        let fontSize = s * 0.14
        let font = NSFont.systemFont(ofSize: fontSize, weight: .bold)
        let textAttributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor(red: 0.5, green: 0.7, blue: 0.9, alpha: 0.6)
        ]
        let text = "MP" as NSString
        let textSize = text.size(withAttributes: textAttributes)
        let textX = (s - textSize.width) / 2
        let textY = s * 0.10
        text.draw(at: NSPoint(x: textX, y: textY), withAttributes: textAttributes)

        // Small dot at the end of the pulse line (like a live indicator)
        let dotRadius = s * 0.025
        let lastPoint = pulsePoints.last!
        let dotX = lastPoint.0 * s
        let dotY = (1.0 - lastPoint.1) * s
        ctx.setFillColor(CGColor(red: 0.3, green: 1.0, blue: 0.5, alpha: 1.0))
        ctx.fillEllipse(in: CGRect(x: dotX - dotRadius, y: dotY - dotRadius, width: dotRadius * 2, height: dotRadius * 2))

        image.unlockFocus()
        images.append(image)
    }

    // Save as iconset then convert
    let fileManager = FileManager.default
    let iconsetPath = "/tmp/MacroPulse.iconset"
    try? fileManager.removeItem(atPath: iconsetPath)
    try! fileManager.createDirectory(atPath: iconsetPath, withIntermediateDirectories: true)

    let sizeNames: [(Int, String)] = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]

    for (targetSize, name) in sizeNames {
        // Find the image with matching size
        guard let img = images.first(where: { Int($0.size.width) == targetSize }) else { continue }
        guard let tiff = img.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let pngData = bitmap.representation(using: .png, properties: [:]) else { continue }
        let filePath = (iconsetPath as NSString).appendingPathComponent(name)
        try! (pngData as NSData).write(toFile: filePath)
    }

    print("Iconset created at \(iconsetPath)")
    print("Run: iconutil -c icns /tmp/MacroPulse.iconset -o AppIcon.icns")
}

generateIcon()
