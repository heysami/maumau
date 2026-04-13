import AppKit

enum CritterIconRenderer {
    private static let size = NSSize(width: 18, height: 18)

    struct Badge {
        let symbolName: String
        let prominence: IconState.BadgeProminence
    }

    private struct Canvas {
        let w: CGFloat
        let h: CGFloat
        let stepX: CGFloat
        let stepY: CGFloat
        let snapX: (CGFloat) -> CGFloat
        let snapY: (CGFloat) -> CGFloat
        let context: CGContext
    }

    private struct Ear {
        let baseLeft: CGPoint
        let tip: CGPoint
        let baseRight: CGPoint
        let controlLeft: CGPoint
        let controlRight: CGPoint
    }

    private struct Geometry {
        let headRect: CGRect
        let headCorner: CGFloat
        let leftEar: Ear
        let rightEar: Ear
        let leftInnerEar: Ear
        let rightInnerEar: Ear
        let leftEyeCenter: CGPoint
        let rightEyeCenter: CGPoint
        let eyeW: CGFloat
        let eyeH: CGFloat
        let noseRect: CGRect
        let noseCorner: CGFloat
        let philtrumRect: CGRect
        let philtrumCorner: CGFloat
        let mouthRects: [CGRect]
        let mouthCorner: CGFloat
        let whiskerRects: [CGRect]
        let whiskerCorner: CGFloat

        init(canvas: Canvas, legWiggle: CGFloat, earWiggle: CGFloat, earScale: CGFloat) {
            let ux = canvas.w / 18
            let uy = canvas.h / 18
            let artScaleX: CGFloat = 1.32
            let artScaleY: CGFloat = 1.46
            let artCenterX: CGFloat = 9
            let artCenterY: CGFloat = 9.05

            let tx: (CGFloat) -> CGFloat = { artCenterX + ($0 - artCenterX) * artScaleX }
            let ty: (CGFloat) -> CGFloat = { artCenterY + ($0 - artCenterY) * artScaleY }

            let sx: (CGFloat) -> CGFloat = { canvas.snapX(tx($0) * ux) }
            let syTop: (CGFloat) -> CGFloat = { canvas.snapY((18 - ty($0)) * uy) }

            func artRect(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) -> CGRect {
                let left = tx(x)
                let right = tx(x + w)
                let top = ty(y)
                let bottom = ty(y + h)
                return CGRect(
                    x: canvas.snapX(left * ux),
                    y: canvas.snapY((18 - bottom) * uy),
                    width: canvas.snapX((right - left) * ux),
                    height: canvas.snapY((bottom - top) * uy))
            }

            func makeEar(baseLeftX: CGFloat, baseRightX: CGFloat, tipX: CGFloat, tipY: CGFloat) -> Ear {
                let baseY = syTop(7)
                let baseLeft = CGPoint(x: sx(baseLeftX), y: baseY)
                let baseRight = CGPoint(x: sx(baseRightX), y: baseY)
                let tip = CGPoint(x: sx(tipX), y: syTop(tipY))
                let controlY = canvas.snapY(tip.y + (baseY - tip.y) * 0.62)
                let controlLeft = CGPoint(
                    x: canvas.snapX(baseLeft.x + (tip.x - baseLeft.x) * 0.55),
                    y: controlY)
                let controlRight = CGPoint(
                    x: canvas.snapX(baseRight.x + (tip.x - baseRight.x) * 0.55),
                    y: controlY)
                return Ear(
                    baseLeft: baseLeft,
                    tip: tip,
                    baseRight: baseRight,
                    controlLeft: controlLeft,
                    controlRight: controlRight)
            }

            let faceLift = 0.24 * legWiggle

            self.headRect = artRect(x: 3.55, y: 5.3 - faceLift * 0.2, w: 10.9, h: 7.8 + faceLift * 0.25)
            self.headCorner = sx(1.5)

            let earDrift = earWiggle * 0.28
            let tipLift = max(0, earScale - 1) * 3.2 + abs(earWiggle) * 0.26
            let leftTipY = max(0.6, 3.1 - tipLift)
            let rightTipY = max(0.6, 3.1 - tipLift)
            self.leftEar = makeEar(
                baseLeftX: 4.6 + earDrift * 0.35,
                baseRightX: 7.9 + earDrift * 0.1,
                tipX: 6.25 + earDrift,
                tipY: leftTipY)
            self.rightEar = makeEar(
                baseLeftX: 10.1 - earDrift * 0.1,
                baseRightX: 13.4 - earDrift * 0.35,
                tipX: 11.75 - earDrift,
                tipY: rightTipY)

            let innerTipLift = tipLift * 0.55
            self.leftInnerEar = makeEar(
                baseLeftX: 5.25 + earDrift * 0.25,
                baseRightX: 7.2 + earDrift * 0.05,
                tipX: 6.3 + earDrift * 0.7,
                tipY: max(1.7, 4.25 - innerTipLift))
            self.rightInnerEar = makeEar(
                baseLeftX: 10.8 - earDrift * 0.05,
                baseRightX: 12.75 - earDrift * 0.25,
                tipX: 11.7 - earDrift * 0.7,
                tipY: max(1.7, 4.25 - innerTipLift))

            self.leftEyeCenter = CGPoint(x: sx(7), y: syTop(9))
            self.rightEyeCenter = CGPoint(x: sx(11), y: syTop(9))
            self.eyeW = canvas.snapX((tx(2) - tx(0)) * ux)
            self.eyeH = canvas.snapY((ty(1) - ty(0)) * uy)

            self.noseRect = artRect(x: 8.2, y: 9.95 - faceLift, w: 1.6, h: 1.35)
            self.noseCorner = sx(0.625)

            let philtrumHeight = 1.75 + legWiggle * 0.6
            self.philtrumRect = artRect(x: 8.5, y: 11.1 - faceLift * 0.45, w: 1, h: philtrumHeight)
            self.philtrumCorner = sx(0.5)

            self.mouthRects = [
                artRect(x: 7.05, y: 12.45 + legWiggle * 0.08, w: 1.95, h: 0.75),
                artRect(x: 9.0, y: 12.45 + legWiggle * 0.08, w: 1.95, h: 0.75),
            ]
            self.mouthCorner = sx(0.375)

            let whiskerSpread = 0.95 * legWiggle
            let whiskerShortW = 3.1 + 0.75 * legWiggle
            let whiskerLongW = 3.35 + 0.95 * legWiggle
            let whiskerOutset = 0.32 * legWiggle
            self.whiskerRects = [
                artRect(x: 3.45 - whiskerOutset, y: 9.4 - whiskerSpread, w: whiskerShortW, h: 0.75),
                artRect(x: 3.1 - whiskerOutset, y: 10.95, w: whiskerLongW, h: 0.75),
                artRect(x: 3.45 - whiskerOutset, y: 12.5 + whiskerSpread, w: whiskerShortW, h: 0.75),
                artRect(x: 11.45, y: 9.4 - whiskerSpread, w: whiskerShortW + whiskerOutset, h: 0.75),
                artRect(x: 11.45, y: 10.95, w: whiskerLongW + whiskerOutset, h: 0.75),
                artRect(x: 11.45, y: 12.5 + whiskerSpread, w: whiskerShortW + whiskerOutset, h: 0.75),
            ]
            self.whiskerCorner = sx(0.375)
        }
    }

    private struct FaceOptions {
        let blink: CGFloat
        let earHoles: Bool
        let earScale: CGFloat
        let eyesClosedLines: Bool
    }

    static func makeIcon(
        blink: CGFloat,
        legWiggle: CGFloat = 0,
        earWiggle: CGFloat = 0,
        earScale: CGFloat = 1,
        earHoles: Bool = false,
        eyesClosedLines: Bool = false,
        badge: Badge? = nil) -> NSImage
    {
        guard let rep = self.makeBitmapRep() else {
            return NSImage(size: self.size)
        }
        rep.size = self.size

        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }

        guard let context = NSGraphicsContext(bitmapImageRep: rep) else {
            return NSImage(size: self.size)
        }
        NSGraphicsContext.current = context
        context.imageInterpolation = .none
        context.cgContext.setShouldAntialias(false)

        let canvas = self.makeCanvas(for: rep, context: context)
        let geometry = Geometry(canvas: canvas, legWiggle: legWiggle, earWiggle: earWiggle, earScale: earScale)

        self.drawBody(in: canvas, geometry: geometry)
        let face = FaceOptions(
            blink: blink,
            earHoles: earHoles,
            earScale: earScale,
            eyesClosedLines: eyesClosedLines)
        self.drawFace(in: canvas, geometry: geometry, options: face)

        if let badge {
            self.drawBadge(badge, canvas: canvas)
        }

        let image = NSImage(size: size)
        image.addRepresentation(rep)
        image.isTemplate = true
        return image
    }

    private static func makeBitmapRep() -> NSBitmapImageRep? {
        // Force a 36x36px backing store (2x for the 18pt logical canvas) so the menu bar icon stays crisp on Retina.
        let pixelsWide = 36
        let pixelsHigh = 36
        return NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelsWide,
            pixelsHigh: pixelsHigh,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bitmapFormat: [],
            bytesPerRow: 0,
            bitsPerPixel: 0)
    }

    private static func makeCanvas(for rep: NSBitmapImageRep, context: NSGraphicsContext) -> Canvas {
        let stepX = self.size.width / max(CGFloat(rep.pixelsWide), 1)
        let stepY = self.size.height / max(CGFloat(rep.pixelsHigh), 1)
        let snapX: (CGFloat) -> CGFloat = { ($0 / stepX).rounded() * stepX }
        let snapY: (CGFloat) -> CGFloat = { ($0 / stepY).rounded() * stepY }

        let w = snapX(size.width)
        let h = snapY(size.height)

        return Canvas(
            w: w,
            h: h,
            stepX: stepX,
            stepY: stepY,
            snapX: snapX,
            snapY: snapY,
            context: context.cgContext)
    }

    private static func drawBody(in canvas: Canvas, geometry: Geometry) {
        canvas.context.setFillColor(NSColor.labelColor.cgColor)

        self.addRoundedRect(geometry.headRect, corner: geometry.headCorner, canvas: canvas)
        self.addEar(geometry.leftEar, canvas: canvas)
        self.addEar(geometry.rightEar, canvas: canvas)
        canvas.context.fillPath()
    }

    private static func drawFace(
        in canvas: Canvas,
        geometry: Geometry,
        options: FaceOptions)
    {
        canvas.context.saveGState()
        canvas.context.setBlendMode(.clear)

        if options.earHoles || options.earScale > 1.05 {
            self.addEar(geometry.leftInnerEar, canvas: canvas)
            self.addEar(geometry.rightInnerEar, canvas: canvas)
        }

        if options.eyesClosedLines {
            let lineW = canvas.snapX(geometry.eyeW * 1.1)
            let lineH = canvas.snapY(max(canvas.stepY * 2, geometry.eyeH * 0.5))
            let corner = canvas.snapX(lineH * 0.6)
            let leftRect = CGRect(
                x: canvas.snapX(geometry.leftEyeCenter.x - lineW / 2),
                y: canvas.snapY(geometry.leftEyeCenter.y - lineH / 2),
                width: lineW,
                height: lineH)
            let rightRect = CGRect(
                x: canvas.snapX(geometry.rightEyeCenter.x - lineW / 2),
                y: canvas.snapY(geometry.rightEyeCenter.y - lineH / 2),
                width: lineW,
                height: lineH)
            self.addRoundedRect(leftRect, corner: corner, canvas: canvas)
            self.addRoundedRect(rightRect, corner: corner, canvas: canvas)
        } else {
            let eyeOpen = max(0.05, 1 - options.blink)
            let eyeH = canvas.snapY(max(canvas.stepY, geometry.eyeH * eyeOpen))
            self.addEye(center: geometry.leftEyeCenter, width: geometry.eyeW, height: eyeH, mirrored: false, canvas: canvas)
            self.addEye(center: geometry.rightEyeCenter, width: geometry.eyeW, height: eyeH, mirrored: true, canvas: canvas)
        }

        self.addRoundedRect(geometry.noseRect, corner: geometry.noseCorner, canvas: canvas)
        self.addRoundedRect(geometry.philtrumRect, corner: geometry.philtrumCorner, canvas: canvas)

        for rect in geometry.mouthRects {
            self.addRoundedRect(rect, corner: geometry.mouthCorner, canvas: canvas)
        }

        for rect in geometry.whiskerRects {
            self.addRoundedRect(rect, corner: geometry.whiskerCorner, canvas: canvas)
        }

        canvas.context.fillPath()
        canvas.context.restoreGState()
    }

    private static func addEar(_ ear: Ear, canvas: Canvas) {
        let path = CGMutablePath()
        path.move(to: ear.baseLeft)
        path.addQuadCurve(to: ear.tip, control: ear.controlLeft)
        path.addQuadCurve(to: ear.baseRight, control: ear.controlRight)
        path.closeSubpath()
        canvas.context.addPath(path)
    }

    private static func addEye(
        center: CGPoint,
        width: CGFloat,
        height: CGFloat,
        mirrored: Bool,
        canvas: Canvas)
    {
        let path = CGMutablePath()
        let outerX = mirrored ? center.x + width / 2 : center.x - width / 2
        let innerX = mirrored ? center.x - width / 2 : center.x + width / 2
        path.move(to: CGPoint(
            x: canvas.snapX(outerX),
            y: canvas.snapY(center.y - height)))
        path.addLine(to: CGPoint(
            x: canvas.snapX(innerX),
            y: canvas.snapY(center.y)))
        path.addLine(to: CGPoint(
            x: canvas.snapX(outerX),
            y: canvas.snapY(center.y + height)))
        path.closeSubpath()
        canvas.context.addPath(path)
    }

    private static func addRoundedRect(_ rect: CGRect, corner: CGFloat, canvas: Canvas) {
        canvas.context.addPath(CGPath(
            roundedRect: rect,
            cornerWidth: corner,
            cornerHeight: corner,
            transform: nil))
    }

    private static func drawBadge(_ badge: Badge, canvas: Canvas) {
        let strength: CGFloat = switch badge.prominence {
        case .primary: 1.0
        case .secondary: 0.58
        case .overridden: 0.85
        }

        // Bigger, higher-contrast badge:
        // - Increase diameter so tool activity is noticeable.
        // - Draw a filled "puck", then knock out the symbol shape (transparent hole).
        //   This reads better in template-rendered menu bar icons than tiny monochrome glyphs.
        let diameter = canvas.snapX(canvas.w * 0.52 * (0.92 + 0.08 * strength)) // ~9-10pt on an 18pt canvas
        let margin = canvas.snapX(max(0.45, canvas.w * 0.03))
        let rect = CGRect(
            x: canvas.snapX(canvas.w - diameter - margin),
            y: canvas.snapY(margin),
            width: diameter,
            height: diameter)

        canvas.context.saveGState()
        canvas.context.setShouldAntialias(true)

        // Clear the underlying pixels so the badge stays readable over the critter.
        canvas.context.saveGState()
        canvas.context.setBlendMode(.clear)
        canvas.context.addEllipse(in: rect.insetBy(dx: -1.0, dy: -1.0))
        canvas.context.fillPath()
        canvas.context.restoreGState()

        let fillAlpha: CGFloat = min(1.0, 0.36 + 0.24 * strength)
        let strokeAlpha: CGFloat = min(1.0, 0.78 + 0.22 * strength)

        canvas.context.setFillColor(NSColor.labelColor.withAlphaComponent(fillAlpha).cgColor)
        canvas.context.addEllipse(in: rect)
        canvas.context.fillPath()

        canvas.context.setStrokeColor(NSColor.labelColor.withAlphaComponent(strokeAlpha).cgColor)
        canvas.context.setLineWidth(max(1.25, canvas.snapX(canvas.w * 0.075)))
        canvas.context.strokeEllipse(in: rect.insetBy(dx: 0.45, dy: 0.45))

        if let base = NSImage(systemSymbolName: badge.symbolName, accessibilityDescription: nil) {
            let pointSize = max(7.0, diameter * 0.82)
            let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .black)
            let symbol = base.withSymbolConfiguration(config) ?? base
            symbol.isTemplate = true

            let symbolRect = rect.insetBy(dx: diameter * 0.17, dy: diameter * 0.17)
            canvas.context.saveGState()
            canvas.context.setBlendMode(.clear)
            symbol.draw(
                in: symbolRect,
                from: .zero,
                operation: .sourceOver,
                fraction: 1,
                respectFlipped: true,
                hints: nil)
            canvas.context.restoreGState()
        }

        canvas.context.restoreGState()
    }
}
