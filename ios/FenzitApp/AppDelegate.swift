import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import RNBootSplash
import GoogleMaps
import FirebaseCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Google Maps SDK key — react-native-maps requires this to be the FIRST
    // call of this method. Read from Info.plist (GOOGLE_MAPS_API_KEY) so the
    // key is still in the tracked Info.plist for now; restrict it by iOS
    // bundle id com.fenzit before launch.
    if let mapsApiKey = Bundle.main.object(
      forInfoDictionaryKey: "GOOGLE_MAPS_API_KEY") as? String {
      GMSServices.provideAPIKey(mapsApiKey)
    }

    // Firebase (FCM, Crashlytics, Analytics) — reads GoogleService-Info.plist
    // from the app bundle. Must run before the React factory starts so every
    // RNFB native module finds the [DEFAULT] app on init.
    FirebaseApp.configure()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "FenzitApp",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView) // initialize the splash screen
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
