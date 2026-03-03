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

// MARK: - MapLibre SwiftUI Wrapper

struct MapLibreMapView: UIViewRepresentable {
    let styleURL: URL
    let annotations: [MapAnnotationItem]
    let fitCoordinates: [CLLocationCoordinate2D]

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> MLNMapView {
        let mapView = MLNMapView()
        mapView.styleURL = styleURL
        mapView.delegate = context.coordinator
        mapView.logoView.isHidden = true
        mapView.attributionButton.isHidden = true
        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {
        // Update style if changed
        if mapView.styleURL != styleURL {
            mapView.styleURL = styleURL
        }

        // Update annotations
        let coordinator = context.coordinator
        coordinator.parent = self

        // Remove old annotations
        if let existing = mapView.annotations {
            mapView.removeAnnotations(existing)
        }

        // Add new annotations
        for item in annotations {
            let point = MLNPointAnnotation()
            point.coordinate = item.coordinate
            point.title = item.title
            point.subtitle = item.subtitle
            mapView.addAnnotation(point)
        }
        coordinator.annotationItems = annotations

        // Fit bounds
        if !fitCoordinates.isEmpty && fitCoordinates.count > 1 {
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
            mapView.setCamera(camera, animated: context.coordinator.hasInitialized)
            context.coordinator.hasInitialized = true
        } else if fitCoordinates.count == 1 {
            mapView.setCenter(fitCoordinates[0], zoomLevel: 15, animated: context.coordinator.hasInitialized)
            context.coordinator.hasInitialized = true
        }
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, MLNMapViewDelegate {
        var parent: MapLibreMapView
        var annotationItems: [MapAnnotationItem] = []
        var hasInitialized = false

        init(_ parent: MapLibreMapView) {
            self.parent = parent
        }

        func mapView(_ mapView: MLNMapView, viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
            guard let pointAnnotation = annotation as? MLNPointAnnotation else { return nil }

            // Find matching annotation item
            guard let item = annotationItems.first(where: {
                $0.coordinate.latitude == pointAnnotation.coordinate.latitude &&
                $0.coordinate.longitude == pointAnnotation.coordinate.longitude
            }) else { return nil }

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

            guard let pointAnnotation = annotation as? MLNPointAnnotation else { return }
            if let item = annotationItems.first(where: {
                $0.coordinate.latitude == pointAnnotation.coordinate.latitude &&
                $0.coordinate.longitude == pointAnnotation.coordinate.longitude
            }) {
                item.onTap?()
            }
        }
    }
}

// MARK: - SwiftUI Annotation View Adapter

class SwiftUIAnnotationView: MLNAnnotationView {
    private var hostingController: UIHostingController<AnyView>?

    func configure(with view: AnyView) {
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
            hostingController = hc
        }

        let size = hostingController?.view.intrinsicContentSize ?? CGSize(width: 44, height: 44)
        frame = CGRect(x: 0, y: 0, width: max(size.width, 44), height: max(size.height, 44))
        centerOffset = CGVector(dx: 0, dy: -frame.height / 2)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
    }
}
