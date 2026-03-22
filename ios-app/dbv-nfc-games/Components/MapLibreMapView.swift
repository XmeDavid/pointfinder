import SwiftUI
import MapLibre

// MARK: - Annotation Model

struct MapAnnotationItem: Identifiable {
    let id: String
    let coordinate: CLLocationCoordinate2D
    let title: String
    let subtitle: String?
    let view: AnyView
    let onTap: (() -> Void)?
}

/// MLNPointAnnotation subclass that carries an identifier for ID-based matching.
class IdentifiablePointAnnotation: MLNPointAnnotation {
    var annotationId: String?
}

// MARK: - MapLibre SwiftUI Wrapper

struct MapLibreMapView: UIViewRepresentable {
    let styleURL: URL
    let annotations: [MapAnnotationItem]
    let fitCoordinates: [CLLocationCoordinate2D]
    var connections: [(CLLocationCoordinate2D, CLLocationCoordinate2D)] = []
    var showsUserLocation: Bool = false
    var onTap: ((CLLocationCoordinate2D) -> Void)? = nil
    var onLongPress: ((CLLocationCoordinate2D) -> Void)? = nil
    var centerOnCoordinate: CLLocationCoordinate2D? = nil
    var fitAllBasesId: UUID? = nil
    var onUserInteraction: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> MLNMapView {
        let mapView = MLNMapView()
        mapView.styleURL = styleURL
        mapView.delegate = context.coordinator
        mapView.logoView.isHidden = true
        mapView.attributionButton.isHidden = true

        if showsUserLocation {
            mapView.showsUserLocation = true
        }

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        tap.cancelsTouchesInView = false
        mapView.addGestureRecognizer(tap)

        let longPress = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleLongPress(_:)))
        longPress.minimumPressDuration = 0.5
        mapView.addGestureRecognizer(longPress)

        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {
        // Update style if changed
        if mapView.styleURL != styleURL {
            mapView.styleURL = styleURL
        }

        // Update user location display
        mapView.showsUserLocation = showsUserLocation

        // Update annotations
        let coordinator = context.coordinator
        coordinator.parent = self
        coordinator.onTap = onTap
        coordinator.onLongPress = onLongPress
        coordinator.onUserInteraction = onUserInteraction

        // Only remove/re-add annotations when they actually change to avoid
        // tearing down annotation views on every SwiftUI render cycle (which
        // causes taps to miss while MapLibre repositions views).
        let newFingerprint = annotations.map { "\($0.id):\($0.coordinate.latitude),\($0.coordinate.longitude):\($0.subtitle ?? "")" }.joined(separator: "|")

        // Always update the items array so tap handlers use fresh closures
        coordinator.annotationItems = annotations

        if newFingerprint != coordinator.lastAnnotationFingerprint {
            coordinator.lastAnnotationFingerprint = newFingerprint

            // Remove old annotations (keep user location annotation)
            if let existing = mapView.annotations {
                let nonUserAnnotations = existing.filter { !($0 is MLNUserLocation) }
                mapView.removeAnnotations(nonUserAnnotations)
            }

            // Add new annotations
            for item in annotations {
                let point = IdentifiablePointAnnotation()
                point.coordinate = item.coordinate
                point.title = item.title
                point.subtitle = item.subtitle
                point.annotationId = item.id
                mapView.addAnnotation(point)
            }
        }

        // Unlock connection lines
        updateConnectionLines(on: mapView)

        // Center on coordinate if requested
        if let center = centerOnCoordinate {
            if coordinator.lastCenterTarget == nil ||
               coordinator.lastCenterTarget!.latitude != center.latitude ||
               coordinator.lastCenterTarget!.longitude != center.longitude {
                mapView.setCenter(center, zoomLevel: max(mapView.zoomLevel, 15), animated: true)
                coordinator.lastCenterTarget = center
            }
        }

        // Fit bounds — only on initial load or explicit fitAllBasesId trigger
        let shouldFit = !coordinator.hasInitialized ||
            (fitAllBasesId != nil && fitAllBasesId != coordinator.lastFitId)
        if shouldFit && !fitCoordinates.isEmpty {
            if fitCoordinates.count > 1 {
                let bounds = fitCoordinates.reduce(
                    MLNCoordinateBounds(
                        sw: fitCoordinates[0],
                        ne: fitCoordinates[0]
                    )
                ) { result, coord in
                    MLNCoordinateBounds(
                        sw: CLLocationCoordinate2D(
                            latitude: min(result.sw.latitude, coord.latitude),
                            longitude: min(result.sw.longitude, coord.longitude)
                        ),
                        ne: CLLocationCoordinate2D(
                            latitude: max(result.ne.latitude, coord.latitude),
                            longitude: max(result.ne.longitude, coord.longitude)
                        )
                    )
                }
                let camera = mapView.cameraThatFitsCoordinateBounds(bounds, edgePadding: UIEdgeInsets(top: 60, left: 40, bottom: 60, right: 40))
                mapView.setCamera(camera, animated: coordinator.hasInitialized)
            } else if fitCoordinates.count == 1 {
                mapView.setCenter(fitCoordinates[0], zoomLevel: 15, animated: coordinator.hasInitialized)
            }
            coordinator.hasInitialized = true
            if let fitId = fitAllBasesId {
                coordinator.lastFitId = fitId
            }
        }
    }

    // MARK: - Connection Lines

    private static let connectionSourceId = "unlock-connections"
    private static let connectionLayerId = "unlock-connections-line"

    private func updateConnectionLines(on mapView: MLNMapView) {
        guard let style = mapView.style else { return }

        // Remove existing
        if let layer = style.layer(withIdentifier: Self.connectionLayerId) {
            style.removeLayer(layer)
        }
        if let source = style.source(withIdentifier: Self.connectionSourceId) {
            style.removeSource(source)
        }

        guard !connections.isEmpty else { return }

        // Build LineString features
        let features = connections.map { (from, to) -> MLNPolylineFeature in
            var coords = [from, to]
            return MLNPolylineFeature(coordinates: &coords, count: 2)
        }

        let source = MLNShapeSource(identifier: Self.connectionSourceId, features: features, options: nil)
        style.addSource(source)

        let layer = MLNLineStyleLayer(identifier: Self.connectionLayerId, source: source)
        layer.lineColor = NSExpression(forConstantValue: UIColor(red: 107.0/255.0, green: 114.0/255.0, blue: 128.0/255.0, alpha: 1))
        layer.lineWidth = NSExpression(forConstantValue: 2)
        layer.lineOpacity = NSExpression(forConstantValue: 0.5)
        layer.lineDashPattern = NSExpression(forConstantValue: [8, 8])
        style.addLayer(layer)
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, MLNMapViewDelegate {
        var parent: MapLibreMapView
        var annotationItems: [MapAnnotationItem] = []
        var hasInitialized = false
        var onTap: ((CLLocationCoordinate2D) -> Void)?
        var onLongPress: ((CLLocationCoordinate2D) -> Void)?
        var lastCenterTarget: CLLocationCoordinate2D?
        var lastFitId: UUID?
        var onUserInteraction: (() -> Void)?
        var lastAnnotationFingerprint: String = ""

        init(_ parent: MapLibreMapView) {
            self.parent = parent
            self.onTap = parent.onTap
            self.onLongPress = parent.onLongPress
            self.onUserInteraction = parent.onUserInteraction
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard gesture.state == .ended else { return }
            guard let mapView = gesture.view as? MLNMapView else { return }
            let point = gesture.location(in: mapView)

            // Check if tap hit an annotation first
            let hitRect = CGRect(
                x: point.x - 22,
                y: point.y - 22,
                width: 44,
                height: 44
            )

            if let visibleAnnotations = mapView.visibleAnnotations(in: hitRect) {
                for annotation in visibleAnnotations {
                    if annotation is MLNUserLocation { continue }
                    guard let pointAnnotation = annotation as? IdentifiablePointAnnotation else { continue }
                    guard let annotationId = pointAnnotation.annotationId,
                          let item = annotationItems.first(where: { $0.id == annotationId })
                    else { continue }
                    item.onTap?()
                    return
                }
            }

            // No annotation hit — forward to map onTap
            let coordinate = mapView.convert(point, toCoordinateFrom: mapView)
            onTap?(coordinate)
        }

        @objc func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
            guard gesture.state == .began else { return }
            guard let mapView = gesture.view as? MLNMapView else { return }
            let point = gesture.location(in: mapView)
            let coordinate = mapView.convert(point, toCoordinateFrom: mapView)
            onLongPress?(coordinate)
        }

        func mapView(_ mapView: MLNMapView, viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
            guard let pointAnnotation = annotation as? IdentifiablePointAnnotation else { return nil }

            guard let annotationId = pointAnnotation.annotationId,
                  let item = annotationItems.first(where: { $0.id == annotationId })
            else { return nil }

            let reuseId = "annotation-\(item.id)"
            let annotationView = mapView.dequeueReusableAnnotationView(withIdentifier: reuseId)
                ?? SwiftUIAnnotationView(reuseIdentifier: reuseId)

            if let swiftUIView = annotationView as? SwiftUIAnnotationView {
                swiftUIView.configure(with: item.view)
            }

            return annotationView
        }

        func mapView(_ mapView: MLNMapView, didSelect annotation: MLNAnnotation) {
            mapView.deselectAnnotation(annotation, animated: false)

            guard let pointAnnotation = annotation as? IdentifiablePointAnnotation else { return }
            guard let annotationId = pointAnnotation.annotationId,
                  let item = annotationItems.first(where: { $0.id == annotationId })
            else { return }
            item.onTap?()
        }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            // Fit to bases once style is loaded (initial camera may have been ignored before style loaded)
            if !parent.fitCoordinates.isEmpty {
                let coords = parent.fitCoordinates
                if coords.count > 1 {
                    let bounds = coords.reduce(
                        MLNCoordinateBounds(sw: coords[0], ne: coords[0])
                    ) { result, coord in
                        MLNCoordinateBounds(
                            sw: CLLocationCoordinate2D(
                                latitude: min(result.sw.latitude, coord.latitude),
                                longitude: min(result.sw.longitude, coord.longitude)
                            ),
                            ne: CLLocationCoordinate2D(
                                latitude: max(result.ne.latitude, coord.latitude),
                                longitude: max(result.ne.longitude, coord.longitude)
                            )
                        )
                    }
                    let camera = mapView.cameraThatFitsCoordinateBounds(bounds, edgePadding: UIEdgeInsets(top: 60, left: 40, bottom: 60, right: 40))
                    mapView.setCamera(camera, animated: false)
                } else if coords.count == 1 {
                    mapView.setCenter(coords[0], zoomLevel: 15, animated: false)
                }
                hasInitialized = true
            }
        }

        func mapView(_ mapView: MLNMapView, regionWillChangeWith reason: MLNCameraChangeReason, animated: Bool) {
            let userGestures: MLNCameraChangeReason = [.gesturePan, .gesturePinch, .gestureRotate, .gestureZoomIn, .gestureZoomOut, .gestureTilt, .gestureOneFingerZoom]
            if !reason.intersection(userGestures).isEmpty {
                onUserInteraction?()
            }
        }
    }
}

// MARK: - SwiftUI Annotation View Adapter

class SwiftUIAnnotationView: MLNAnnotationView {
    private var hostingController: UIHostingController<AnyView>?
    private weak var parentViewController: UIViewController?

    func configure(with view: AnyView, parentViewController: UIViewController? = nil) {
        self.parentViewController = parentViewController
        if let hc = hostingController {
            hc.rootView = view
            hc.view.invalidateIntrinsicContentSize()
        } else {
            let hc = UIHostingController(rootView: view)
            hc.view.backgroundColor = .clear
            hc.view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(hc.view)
            NSLayoutConstraint.activate([
                hc.view.centerXAnchor.constraint(equalTo: centerXAnchor),
                hc.view.centerYAnchor.constraint(equalTo: centerYAnchor),
            ])
            // Add hosting controller as a child view controller if parent is available
            if let parentViewController = parentViewController {
                parentViewController.addChild(hc)
                hc.didMove(toParent: parentViewController)
            }
            hostingController = hc
        }

        let size = hostingController?.view.intrinsicContentSize ?? CGSize(width: 44, height: 44)
        frame = CGRect(x: 0, y: 0, width: max(size.width, 44), height: max(size.height, 44))
        centerOffset = CGVector(dx: 0, dy: -frame.height / 2)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        if let hc = hostingController {
            hc.willMove(toParent: nil)
            hc.removeFromParent()
        }
    }
}
