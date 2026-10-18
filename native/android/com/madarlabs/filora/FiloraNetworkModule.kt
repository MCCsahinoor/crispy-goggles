package com.madarlabs.filora

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.net.wifi.WpsInfo
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean

class FiloraNetworkModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())
  private var hotspotReservation: WifiManager.LocalOnlyHotspotReservation? = null
  private var hotspotGeneration = 0

  private var p2pManager: WifiP2pManager? = null
  private var p2pChannel: WifiP2pManager.Channel? = null
  private var p2pRegistered = false
  private var directGeneration = 0
  private var connectPromise: Promise? = null
  private var connectTarget: String? = null
  private var connectRequested = false
  private var connectTimeout: Runnable? = null

  // Nearby discovery: mDNS (NSD) on a shared network, DNS-SD over Wi-Fi Direct when offline.
  private var nsdManager: NsdManager? = null
  private var nsdRegistration: NsdManager.RegistrationListener? = null
  private var nsdDiscovery: NsdManager.DiscoveryListener? = null
  private val nsdResolveQueue = ArrayDeque<NsdServiceInfo>()
  private var nsdResolving = false
  private var p2pLocalService: WifiP2pDnsSdServiceInfo? = null
  private var p2pServiceRequest: WifiP2pDnsSdServiceRequest? = null
  private var advertiseGeneration = 0
  private var discoveryGeneration = 0
  private var advertiseTicker: Runnable? = null
  private var discoveryTicker: Runnable? = null

  private val p2pFilter =
      IntentFilter().apply {
        addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
      }

  private val p2pReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          when (intent?.action) {
            WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> considerPeers()
            WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
              val info = readP2pInfo(intent)
              val host = info?.groupOwnerAddress?.hostAddress
              if (info?.groupFormed == true && isUsefulIpv4(host)) {
                resolveConnect(host!!)
              }
            }
          }
        }
      }

  override fun getName(): String = "FiloraNetwork"

  override fun invalidate() {
    mainHandler.post {
      hotspotGeneration += 1
      hotspotReservation?.close()
      hotspotReservation = null
      advertiseGeneration += 1
      discoveryGeneration += 1
      stopAdvertisingLocked()
      stopDiscoveryLocked()
      stopDirectLocked()
    }
    super.invalidate()
  }

  // Required by NativeEventEmitter; events are sent through DeviceEventEmitter.
  @ReactMethod fun addListener(eventName: String) {}

  @ReactMethod fun removeListeners(count: Double) {}

  /**
   * Advertise this receiver to nearby phones. The TXT record carries the pairing fields, so a
   * sender can connect without scanning a QR code. The receiver still approves every transfer.
   */
  @ReactMethod
  fun startAdvertising(info: ReadableMap, usePeerToPeer: Boolean, promise: Promise) {
    val generation = ++advertiseGeneration
    onMain {
      stopAdvertisingLocked()
      val record = txtRecord(info)
      val sid = record["sid"]
      val port = record["port"]?.toIntOrNull()
      if (sid.isNullOrBlank() || port == null || port !in 1..65535) {
        promise.reject("discovery", "record")
        return@onMain
      }
      val instance = "$SERVICE_PREFIX$sid"
      val nsdOk = registerNsd(instance, port, record)
      if (!usePeerToPeer || !hasRadioPermission()) {
        promise.resolve(discoveryResult(nsdOk, false))
        return@onMain
      }
      val manager = p2pManagerOrNull()
      val channel = manager?.let { p2pChannelOrNull(it) }
      if (manager == null || channel == null) {
        promise.resolve(discoveryResult(nsdOk, false))
        return@onMain
      }
      val service = WifiP2pDnsSdServiceInfo.newInstance(instance, SERVICE_TYPE, record)
      try {
        manager.addLocalService(
            channel,
            service,
            object : WifiP2pManager.ActionListener {
              override fun onSuccess() {
                if (generation != advertiseGeneration) {
                  safeP2p { manager.removeLocalService(channel, service, null) }
                  promise.resolve(discoveryResult(nsdOk, false))
                  return
                }
                p2pLocalService = service
                startAdvertiseTicker(manager, channel, generation)
                promise.resolve(discoveryResult(nsdOk, true))
              }

              override fun onFailure(reason: Int) {
                promise.resolve(discoveryResult(nsdOk, false))
              }
            },
        )
      } catch (_: Exception) {
        promise.resolve(discoveryResult(nsdOk, false))
      }
    }
  }

  @ReactMethod
  fun stopAdvertising(promise: Promise) {
    advertiseGeneration += 1
    onMain {
      stopAdvertisingLocked()
      promise.resolve(null)
    }
  }

  /** Look for advertising receivers. Results arrive as FiloraPeerFound / FiloraPeerLost events. */
  @ReactMethod
  fun startDiscovery(promise: Promise) {
    val generation = ++discoveryGeneration
    onMain {
      stopDiscoveryLocked()
      val nsdOk = discoverNsd(generation)
      if (!hasRadioPermission()) {
        promise.resolve(discoveryResult(nsdOk, false))
        return@onMain
      }
      val manager = p2pManagerOrNull()
      val channel = manager?.let { p2pChannelOrNull(it) }
      if (manager == null || channel == null) {
        promise.resolve(discoveryResult(nsdOk, false))
        return@onMain
      }
      manager.setDnsSdResponseListeners(
          channel,
          WifiP2pManager.DnsSdServiceResponseListener { _, _, _ -> },
          WifiP2pManager.DnsSdTxtRecordListener { fullDomainName, record, device ->
            if (generation != discoveryGeneration) {
              return@DnsSdTxtRecordListener
            }
            if (!fullDomainName.lowercase().contains(SERVICE_TYPE)) {
              return@DnsSdTxtRecordListener
            }
            val address = device?.deviceAddress ?: return@DnsSdTxtRecordListener
            val map = Arguments.createMap()
            map.putString("source", "p2p")
            map.putString("id", address)
            map.putString("deviceAddress", address)
            map.putString("deviceName", device.deviceName)
            for ((key, value) in record) {
              if (value != null) {
                map.putString(key.lowercase(), value)
              }
            }
            emit(EVENT_FOUND, map)
          },
      )
      val request = WifiP2pDnsSdServiceRequest.newInstance(SERVICE_TYPE)
      try {
        manager.addServiceRequest(
            channel,
            request,
            object : WifiP2pManager.ActionListener {
              override fun onSuccess() {
                if (generation != discoveryGeneration) {
                  safeP2p { manager.removeServiceRequest(channel, request, null) }
                  promise.resolve(discoveryResult(nsdOk, false))
                  return
                }
                p2pServiceRequest = request
                startDiscoveryTicker(manager, channel, generation)
                promise.resolve(discoveryResult(nsdOk, true))
              }

              override fun onFailure(reason: Int) {
                promise.resolve(discoveryResult(nsdOk, false))
              }
            },
        )
      } catch (_: Exception) {
        promise.resolve(discoveryResult(nsdOk, false))
      }
    }
  }

  @ReactMethod
  fun stopDiscovery(promise: Promise) {
    discoveryGeneration += 1
    onMain {
      stopDiscoveryLocked()
      promise.resolve(null)
    }
  }

  private fun registerNsd(instance: String, port: Int, record: Map<String, String>): Boolean {
    val nsd = nsd() ?: return false
    return try {
      val service =
          NsdServiceInfo().apply {
            serviceName = instance
            serviceType = SERVICE_TYPE
            setPort(port)
            for ((key, value) in record) {
              setAttribute(key, value)
            }
          }
      val listener =
          object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) {}

            override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {
              onMain {
                if (nsdRegistration === this) {
                  nsdRegistration = null
                }
              }
            }

            override fun onServiceUnregistered(info: NsdServiceInfo) {}

            override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) {}
          }
      nsd.registerService(service, NsdManager.PROTOCOL_DNS_SD, listener)
      nsdRegistration = listener
      true
    } catch (_: Exception) {
      nsdRegistration = null
      false
    }
  }

  private fun discoverNsd(generation: Int): Boolean {
    val nsd = nsd() ?: return false
    val listener =
        object : NsdManager.DiscoveryListener {
          override fun onDiscoveryStarted(serviceType: String) {}

          override fun onDiscoveryStopped(serviceType: String) {}

          override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            onMain {
              if (nsdDiscovery === this) {
                nsdDiscovery = null
              }
            }
          }

          override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}

          override fun onServiceFound(info: NsdServiceInfo) {
            onMain {
              if (generation != discoveryGeneration || !info.serviceName.startsWith(SERVICE_PREFIX)) {
                return@onMain
              }
              nsdResolveQueue.add(info)
              resolveNext(generation)
            }
          }

          override fun onServiceLost(info: NsdServiceInfo) {
            onMain {
              if (generation != discoveryGeneration) {
                return@onMain
              }
              val map = Arguments.createMap()
              map.putString("source", "nsd")
              map.putString("id", info.serviceName)
              emit(EVENT_LOST, map)
            }
          }
        }
    return try {
      nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
      nsdDiscovery = listener
      true
    } catch (_: Exception) {
      false
    }
  }

  /** NSD resolves one service at a time on older Android versions, so resolve serially. */
  @Suppress("DEPRECATION")
  private fun resolveNext(generation: Int) {
    if (nsdResolving || generation != discoveryGeneration) {
      return
    }
    val next = nsdResolveQueue.poll() ?: return
    val nsd = nsdManager ?: return
    nsdResolving = true
    try {
      nsd.resolveService(
          next,
          object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
              onMain {
                nsdResolving = false
                resolveNext(generation)
              }
            }

            override fun onServiceResolved(info: NsdServiceInfo) {
              onMain {
                nsdResolving = false
                if (generation == discoveryGeneration) {
                  val map = Arguments.createMap()
                  map.putString("source", "nsd")
                  map.putString("id", info.serviceName)
                  for ((key, value) in info.attributes) {
                    if (value != null) {
                      map.putString(key.lowercase(), String(value, Charsets.UTF_8))
                    }
                  }
                  val host = info.host?.hostAddress
                  if (isUsefulIpv4(host)) {
                    map.putString("resolvedHost", host)
                  }
                  map.putInt("resolvedPort", info.port)
                  emit(EVENT_FOUND, map)
                }
                resolveNext(generation)
              }
            }
          },
      )
    } catch (_: Exception) {
      nsdResolving = false
    }
  }

  /** Keep the receiver in P2P listen state so it answers service discovery queries. */
  private fun startAdvertiseTicker(manager: WifiP2pManager, channel: WifiP2pManager.Channel, generation: Int) {
    advertiseTicker?.let { mainHandler.removeCallbacks(it) }
    val ticker =
        object : Runnable {
          override fun run() {
            if (generation != advertiseGeneration) {
              return
            }
            safeP2p { manager.discoverPeers(channel, null) }
            mainHandler.postDelayed(this, ADVERTISE_TICK_MS)
          }
        }
    advertiseTicker = ticker
    ticker.run()
  }

  /** P2P service discovery stops on its own after a while, so re-run it on a timer. */
  private fun startDiscoveryTicker(manager: WifiP2pManager, channel: WifiP2pManager.Channel, generation: Int) {
    discoveryTicker?.let { mainHandler.removeCallbacks(it) }
    val ticker =
        object : Runnable {
          override fun run() {
            if (generation != discoveryGeneration) {
              return
            }
            safeP2p {
              manager.discoverPeers(channel, null)
              manager.discoverServices(channel, null)
            }
            mainHandler.postDelayed(this, DISCOVERY_TICK_MS)
          }
        }
    discoveryTicker = ticker
    ticker.run()
  }

  private fun stopAdvertisingLocked() {
    advertiseTicker?.let { mainHandler.removeCallbacks(it) }
    advertiseTicker = null
    nsdRegistration?.let { listener ->
      try {
        nsdManager?.unregisterService(listener)
      } catch (_: Exception) {
        // Already unregistered.
      }
    }
    nsdRegistration = null
    val service = p2pLocalService
    p2pLocalService = null
    val manager = p2pManager
    val channel = p2pChannel
    if (service != null && manager != null && channel != null) {
      safeP2p { manager.removeLocalService(channel, service, null) }
    }
  }

  private fun stopDiscoveryLocked() {
    discoveryTicker?.let { mainHandler.removeCallbacks(it) }
    discoveryTicker = null
    nsdDiscovery?.let { listener ->
      try {
        nsdManager?.stopServiceDiscovery(listener)
      } catch (_: Exception) {
        // Discovery already stopped.
      }
    }
    nsdDiscovery = null
    nsdResolveQueue.clear()
    nsdResolving = false
    val request = p2pServiceRequest
    p2pServiceRequest = null
    val manager = p2pManager
    val channel = p2pChannel
    if (request != null && manager != null && channel != null) {
      safeP2p { manager.removeServiceRequest(channel, request, null) }
    }
  }

  private fun nsd(): NsdManager? {
    val existing = nsdManager
    if (existing != null) {
      return existing
    }
    val created =
        reactApplicationContext.applicationContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    nsdManager = created
    return created
  }

  private fun p2pManagerOrNull(): WifiP2pManager? {
    val existing = p2pManager
    if (existing != null) {
      return existing
    }
    val created =
        reactApplicationContext.applicationContext.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
    p2pManager = created
    return created
  }

  private fun p2pChannelOrNull(manager: WifiP2pManager): WifiP2pManager.Channel? {
    val existing = p2pChannel
    if (existing != null) {
      return existing
    }
    val created = manager.initialize(reactApplicationContext, mainHandler.looper, null)
    p2pChannel = created
    return created
  }

  private inline fun safeP2p(block: () -> Unit) {
    try {
      block()
    } catch (_: Exception) {
      // P2P calls throw SecurityException when a permission was revoked mid-session.
    }
  }

  private fun txtRecord(info: ReadableMap): Map<String, String> {
    val out = LinkedHashMap<String, String>()
    val keys = info.keySetIterator()
    while (keys.hasNextKey()) {
      val key = keys.nextKey()
      val value =
          when (info.getType(key)) {
            ReadableType.String -> info.getString(key)
            ReadableType.Number -> {
              val number = info.getDouble(key)
              if (number % 1.0 == 0.0) number.toLong().toString() else number.toString()
            }
            ReadableType.Boolean -> info.getBoolean(key).toString()
            else -> null
          }
      if (!value.isNullOrBlank() && key.length in 1..9 && value.length <= 200) {
        out[key.lowercase()] = value
      }
    }
    return out
  }

  private fun discoveryResult(nsd: Boolean, p2p: Boolean): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("nsd", nsd)
    map.putBoolean("p2p", p2p)
    return map
  }

  private fun emit(event: String, payload: WritableMap) {
    try {
      reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(event, payload)
    } catch (_: Exception) {
      // JS is not running (app reload or teardown).
    }
  }

  @ReactMethod
  fun getNetworkIpv4(promise: Promise) {
    try {
      val ranked = mutableListOf<Pair<Int, String>>()
      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces != null && interfaces.hasMoreElements()) {
        val nif = interfaces.nextElement()
        if (!nif.isUp || skipInterface(nif.name)) {
          continue
        }
        val score = interfaceScore(nif.name)
        val addresses = nif.inetAddresses
        while (addresses.hasMoreElements()) {
          val addr = addresses.nextElement()
          if (addr is Inet4Address && !addr.isLoopbackAddress) {
            val host = addr.hostAddress ?: continue
            if (!isUsefulIpv4(host)) {
              continue
            }
            ranked.add(score to host)
          }
        }
      }
      ranked.sortBy { it.first }
      val array = Arguments.createArray()
      val seen = HashSet<String>()
      for ((_, ip) in ranked) {
        if (seen.add(ip)) {
          array.pushString(ip)
        }
      }
      promise.resolve(array)
    } catch (error: Exception) {
      promise.reject("ip", error.message, error)
    }
  }

  @ReactMethod
  fun startLocalHotspot(promise: Promise) {
    val generation = ++hotspotGeneration
    onMain {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.reject("hotspot", "unsupported")
        return@onMain
      }
      if (!hasRadioPermission()) {
        promise.reject("permission", "permission")
        return@onMain
      }
      val wifi =
          reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      if (wifi == null) {
        promise.reject("hotspot", "wifi")
        return@onMain
      }
      try {
        hotspotReservation?.close()
      } catch (_: Exception) {
        // The previous reservation may already be closed.
      }
      hotspotReservation = null
      val settled = AtomicBoolean(false)
      try {
        wifi.startLocalOnlyHotspot(
            object : WifiManager.LocalOnlyHotspotCallback() {
              override fun onStarted(reservation: WifiManager.LocalOnlyHotspotReservation) {
                if (generation != hotspotGeneration || !settled.compareAndSet(false, true)) {
                  reservation.close()
                  return
                }
                hotspotReservation = reservation
                val creds = readHotspotCredentials(reservation)
                val ssid = creds.first
                val password = creds.second
                if (ssid.isNullOrBlank() || password.isNullOrBlank()) {
                  reservation.close()
                  hotspotReservation = null
                  promise.reject("hotspot", "credentials")
                  return
                }
                val map = Arguments.createMap()
                map.putString("ssid", ssid)
                map.putString("password", password)
                promise.resolve(map)
              }

              override fun onFailed(reason: Int) {
                if (generation != hotspotGeneration || !settled.compareAndSet(false, true)) {
                  return
                }
                promise.reject("hotspot", "failed:$reason")
              }
            },
            mainHandler,
        )
      } catch (error: SecurityException) {
        promise.reject("permission", error.message, error)
      } catch (error: Exception) {
        promise.reject("hotspot", error.message, error)
      }
    }
  }

  /**
   * Nearby Wi-Fi networks whose name starts with `DIRECT-` (Wi-Fi Direct groups advertise as
   * ordinary networks). `trigger` asks the system for a fresh scan; Android allows a foreground
   * app four of those per two minutes, so callers read the cached results more often than that.
   */
  @ReactMethod
  fun scanWifiNetworks(trigger: Boolean, promise: Promise) {
    try {
      val wifi =
          reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      if (wifi == null) {
        promise.resolve(Arguments.createArray())
        return
      }
      if (trigger) {
        try {
          @Suppress("DEPRECATION") wifi.startScan()
        } catch (_: Exception) {
          // Throttled or refused; cached results are still useful.
        }
      }
      val array = Arguments.createArray()
      @Suppress("DEPRECATION") val results = wifi.scanResults ?: emptyList()
      val seen = HashSet<String>()
      for (result in results) {
        @Suppress("DEPRECATION") val ssid = result.SSID ?: continue
        if (!ssid.startsWith("DIRECT-") || !seen.add(ssid)) {
          continue
        }
        val map = Arguments.createMap()
        map.putString("ssid", ssid)
        map.putString("bssid", result.BSSID ?: "")
        map.putInt("level", result.level)
        map.putInt("frequency", result.frequency)
        array.pushMap(map)
      }
      promise.resolve(array)
    } catch (error: SecurityException) {
      promise.reject("permission", error.message, error)
    } catch (error: Exception) {
      promise.reject("scan", error.message, error)
    }
  }

  /** Gateway of the current Wi-Fi connection: the group owner after joining a Wi-Fi Direct group. */
  @ReactMethod
  fun getGatewayIpv4(promise: Promise) {
    try {
      val wifi =
          reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      @Suppress("DEPRECATION") val gateway = wifi?.dhcpInfo?.gateway ?: 0
      if (gateway == 0) {
        promise.resolve(null)
        return
      }
      val host =
          "${gateway and 0xff}.${(gateway shr 8) and 0xff}.${(gateway shr 16) and 0xff}.${(gateway shr 24) and 0xff}"
      promise.resolve(if (isUsefulIpv4(host)) host else null)
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun stopLocalHotspot(promise: Promise) {
    onMain {
      hotspotGeneration += 1
      try {
        hotspotReservation?.close()
      } catch (_: Exception) {
        // Already closed.
      }
      hotspotReservation = null
      promise.resolve(null)
    }
  }

  /**
   * Create a Wi-Fi Direct group and become its owner. On Android 10+ the group's network name and
   * passphrase can be chosen (`options.networkName` must start with `DIRECT-xy`), which lets other
   * phones find the group with an ordinary Wi-Fi scan and join it like a hotspot.
   */
  @ReactMethod
  fun startWifiDirect(options: ReadableMap?, promise: Promise) {
    val generation = ++directGeneration
    onMain {
      if (!hasRadioPermission()) {
        promise.reject("permission", "permission")
        return@onMain
      }
      val manager = managerOrReject(promise) ?: return@onMain
      val channel = channelOrReject(manager, promise) ?: return@onMain
      registerP2pReceiver()
      val settled = AtomicBoolean(false)
      val config = directConfig(options)
      manager.removeGroup(
          channel,
          object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
              createDirectGroup(manager, channel, generation, promise, settled, config)
            }

            override fun onFailure(reason: Int) {
              createDirectGroup(manager, channel, generation, promise, settled, config)
            }
          },
      )
    }
  }

  @ReactMethod
  fun connectWifiDirect(deviceAddress: String, promise: Promise) {
    val generation = directGeneration
    onMain {
      if (!hasRadioPermission()) {
        promise.reject("permission", "permission")
        return@onMain
      }
      val normalized = deviceAddress.trim()
      if (!MAC.matches(normalized)) {
        promise.reject("direct", "address")
        return@onMain
      }
      val manager = managerOrReject(promise) ?: return@onMain
      val channel = channelOrReject(manager, promise) ?: return@onMain
      rejectConnect("cancelled")
      connectPromise = promise
      connectTarget = normalized
      connectRequested = false
      registerP2pReceiver()
      val timeout =
          Runnable {
            if (generation == directGeneration) {
              rejectConnect("timeout")
            }
          }
      connectTimeout = timeout
      mainHandler.postDelayed(timeout, 25_000)
      manager.discoverPeers(
          channel,
          object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
              considerPeers()
            }

            override fun onFailure(reason: Int) {
              requestConnect()
            }
          },
      )
    }
  }

  @ReactMethod
  fun stopWifiDirect(promise: Promise) {
    onMain {
      directGeneration += 1
      stopDirectLocked()
      promise.resolve(null)
    }
  }

  private fun directConfig(options: ReadableMap?): WifiP2pConfig? {
    if (Build.VERSION.SDK_INT < 29 || options == null) {
      return null
    }
    val name = if (options.hasKey("networkName")) options.getString("networkName") else null
    val passphrase = if (options.hasKey("passphrase")) options.getString("passphrase") else null
    if (name.isNullOrBlank() || passphrase.isNullOrBlank() || passphrase.length !in 8..63) {
      return null
    }
    return try {
      val builder = WifiP2pConfig.Builder().setNetworkName(name).setPassphrase(passphrase)
      val band = if (options.hasKey("band")) options.getString("band") else null
      when (band) {
        "2.4" -> builder.setGroupOperatingBand(WifiP2pConfig.GROUP_OWNER_BAND_2GHZ)
        "5" -> builder.setGroupOperatingBand(WifiP2pConfig.GROUP_OWNER_BAND_5GHZ)
        else -> builder.setGroupOperatingBand(WifiP2pConfig.GROUP_OWNER_BAND_AUTO)
      }
      builder.build()
    } catch (_: Exception) {
      null
    }
  }

  private fun createDirectGroup(
      manager: WifiP2pManager,
      channel: WifiP2pManager.Channel,
      generation: Int,
      promise: Promise,
      settled: AtomicBoolean,
      config: WifiP2pConfig?,
  ) {
    if (generation != directGeneration || settled.get()) {
      return
    }
    val listener =
        object : WifiP2pManager.ActionListener {
          override fun onSuccess() {
            publishDirectGroup(manager, channel, generation, promise, settled, 0)
          }

          override fun onFailure(reason: Int) {
            if (config != null) {
              // Some phones refuse a custom name or band; a plain group still works with the QR code.
              createDirectGroup(manager, channel, generation, promise, settled, null)
              return
            }
            if (generation == directGeneration && settled.compareAndSet(false, true)) {
              promise.reject("direct", "create:$reason")
            }
          }
        }
    if (config != null && Build.VERSION.SDK_INT >= 29) {
      manager.createGroup(channel, config, listener)
    } else {
      @Suppress("DEPRECATION") manager.createGroup(channel, listener)
    }
  }

  private fun publishDirectGroup(
      manager: WifiP2pManager,
      channel: WifiP2pManager.Channel,
      generation: Int,
      promise: Promise,
      settled: AtomicBoolean,
      attempt: Int,
  ) {
    if (generation != directGeneration || settled.get()) {
      return
    }
    manager.requestConnectionInfo(channel) { info ->
      if (generation != directGeneration || settled.get()) {
        return@requestConnectionInfo
      }
      manager.requestGroupInfo(channel) { group ->
        if (generation != directGeneration || settled.get()) {
          return@requestGroupInfo
        }
        val owner = info != null && info.groupFormed && info.isGroupOwner
        val host = info?.groupOwnerAddress?.hostAddress?.takeIf { isUsefulIpv4(it) }
            ?: firstInterfaceIpv4 { name -> name.contains("p2p") }
        val address = group?.owner?.deviceAddress
        if (owner && isUsefulIpv4(host) && !address.isNullOrBlank() && settled.compareAndSet(false, true)) {
          val map = Arguments.createMap()
          map.putString("host", host)
          map.putString("deviceAddress", address)
          map.putString("deviceName", group.owner?.deviceName)
          map.putString("ssid", group.networkName)
          map.putString("passphrase", group.passphrase)
          promise.resolve(map)
          return@requestGroupInfo
        }
        if (attempt >= 10 && owner && !address.isNullOrBlank() && settled.compareAndSet(false, true)) {
          val map = Arguments.createMap()
          map.putString("host", host ?: "192.168.49.1")
          map.putString("deviceAddress", address)
          map.putString("deviceName", group?.owner?.deviceName)
          map.putString("ssid", group?.networkName)
          map.putString("passphrase", group?.passphrase)
          promise.resolve(map)
          return@requestGroupInfo
        }
        if (attempt >= 10) {
          if (settled.compareAndSet(false, true)) {
            promise.reject("direct", "group")
          }
          return@requestGroupInfo
        }
        mainHandler.postDelayed(
            { publishDirectGroup(manager, channel, generation, promise, settled, attempt + 1) },
            500,
        )
      }
    }
  }

  private fun considerPeers() {
    val manager = p2pManager ?: return
    val channel = p2pChannel ?: return
    val target = connectTarget ?: return
    manager.requestPeers(channel) { peers ->
      val match =
          peers.deviceList.any { device -> device.deviceAddress.equals(target, ignoreCase = true) }
      if (match) {
        requestConnect()
      }
    }
  }

  private fun requestConnect() {
    if (connectRequested || connectPromise == null) {
      return
    }
    val manager = p2pManager ?: return
    val channel = p2pChannel ?: return
    val target = connectTarget ?: return
    connectRequested = true
    val config =
        WifiP2pConfig().apply {
          deviceAddress = target
          wps.setup = WpsInfo.PBC
        }
    manager.connect(
        channel,
        config,
        object : WifiP2pManager.ActionListener {
          override fun onSuccess() {
            // The connection broadcast resolves the promise once the group has an address.
          }

          override fun onFailure(reason: Int) {
            connectRequested = false
            if (reason == WifiP2pManager.BUSY) {
              return
            }
            rejectConnect("connect:$reason")
          }
        },
    )
  }

  private fun resolveConnect(host: String) {
    val promise = connectPromise ?: return
    connectPromise = null
    connectTarget = null
    connectRequested = false
    connectTimeout?.let { mainHandler.removeCallbacks(it) }
    connectTimeout = null
    val map = Arguments.createMap()
    map.putString("host", host)
    promise.resolve(map)
  }

  private fun rejectConnect(reason: String) {
    val promise = connectPromise ?: return
    connectPromise = null
    connectTarget = null
    connectRequested = false
    connectTimeout?.let { mainHandler.removeCallbacks(it) }
    connectTimeout = null
    promise.reject("direct", reason)
  }

  private fun stopDirectLocked() {
    rejectConnect("cancelled")
    val manager = p2pManager
    val channel = p2pChannel
    if (manager != null && channel != null) {
      manager.removeGroup(
          channel,
          object : WifiP2pManager.ActionListener {
            override fun onSuccess() {}

            override fun onFailure(reason: Int) {}
          },
      )
    }
    if (p2pRegistered) {
      try {
        reactApplicationContext.unregisterReceiver(p2pReceiver)
      } catch (_: Exception) {
        // The receiver was already removed.
      }
      p2pRegistered = false
    }
  }

  private fun registerP2pReceiver() {
    if (p2pRegistered) {
      return
    }
    if (Build.VERSION.SDK_INT >= 33) {
      reactApplicationContext.registerReceiver(p2pReceiver, p2pFilter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      reactApplicationContext.registerReceiver(p2pReceiver, p2pFilter)
    }
    p2pRegistered = true
  }

  private fun managerOrReject(promise: Promise): WifiP2pManager? {
    val existing = p2pManager
    if (existing != null) {
      return existing
    }
    val manager =
        reactApplicationContext.applicationContext.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
    if (manager == null) {
      promise.reject("direct", "unsupported")
      return null
    }
    p2pManager = manager
    return manager
  }

  private fun channelOrReject(manager: WifiP2pManager, promise: Promise): WifiP2pManager.Channel? {
    val existing = p2pChannel
    if (existing != null) {
      return existing
    }
    val channel = manager.initialize(reactApplicationContext, mainHandler.looper, null)
    if (channel == null) {
      promise.reject("direct", "channel")
      return null
    }
    p2pChannel = channel
    return channel
  }

  @Suppress("DEPRECATION")
  private fun readHotspotCredentials(
      reservation: WifiManager.LocalOnlyHotspotReservation
  ): Pair<String?, String?> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val soft = reservation.softApConfiguration
      return readSsid(soft) to unquote(soft.passphrase)
    }
    @Suppress("DEPRECATION")
    val config = reservation.wifiConfiguration
    return unquote(config?.SSID) to unquote(config?.preSharedKey)
  }

  private fun readSsid(soft: android.net.wifi.SoftApConfiguration): String? {
    if (Build.VERSION.SDK_INT >= 33) {
      val printed = unquote(soft.wifiSsid?.toString())
      if (!printed.isNullOrBlank()) {
        return printed
      }
    }
    return try {
      val method = soft.javaClass.methods.firstOrNull { it.name == "getSsid" && it.parameterCount == 0 }
      unquote(method?.invoke(soft)?.toString())
    } catch (_: Exception) {
      null
    }
  }

  private fun firstInterfaceIpv4(prefer: (String) -> Boolean): String? {
    val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
    while (interfaces.hasMoreElements()) {
      val nif = interfaces.nextElement()
      if (!nif.isUp || !prefer(nif.name.lowercase())) {
        continue
      }
      val addresses = nif.inetAddresses
      while (addresses.hasMoreElements()) {
        val addr = addresses.nextElement()
        if (addr is Inet4Address && isUsefulIpv4(addr.hostAddress)) {
          return addr.hostAddress
        }
      }
    }
    return null
  }

  private fun hasRadioPermission(): Boolean {
    val fine =
        ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    if (Build.VERSION.SDK_INT >= 33) {
      val nearby =
          ContextCompat.checkSelfPermission(
              reactApplicationContext,
              Manifest.permission.NEARBY_WIFI_DEVICES,
          ) == PackageManager.PERMISSION_GRANTED
      return fine || nearby
    }
    return fine
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
    } else {
      mainHandler.post(block)
    }
  }

  private fun readP2pInfo(intent: Intent): WifiP2pInfo? {
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(WifiP2pManager.EXTRA_WIFI_P2P_INFO, WifiP2pInfo::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(WifiP2pManager.EXTRA_WIFI_P2P_INFO)
    }
  }

  companion object {
    private val MAC = Regex("^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$")
    private const val SERVICE_TYPE = "_filora._tcp"
    private const val SERVICE_PREFIX = "Filora-"
    private const val EVENT_FOUND = "FiloraPeerFound"
    private const val EVENT_LOST = "FiloraPeerLost"
    private const val ADVERTISE_TICK_MS = 20_000L
    private const val DISCOVERY_TICK_MS = 12_000L

    private fun skipInterface(name: String): Boolean {
      val n = name.lowercase()
      return n == "lo" ||
          n.startsWith("rmnet") ||
          n.startsWith("ccmni") ||
          n.startsWith("pdp") ||
          n.contains("dummy") ||
          n.startsWith("tun") ||
          n.contains("clat") ||
          n.startsWith("v4-")
    }

    private fun interfaceScore(name: String): Int {
      val n = name.lowercase()
      return when {
        n.contains("p2p") -> 0
        n.contains("swlan") || n.contains("softap") || n.startsWith("ap") -> 1
        n == "wlan1" || n == "wlan2" -> 2
        n.contains("wlan") -> 3
        else -> 4
      }
    }

    private fun isUsefulIpv4(host: String?): Boolean {
      if (host.isNullOrBlank() || host == "0.0.0.0" || host.startsWith("169.254.")) {
        return false
      }
      val parts = host.split(".")
      if (parts.size != 4) {
        return false
      }
      return parts.all { part ->
        val value = part.toIntOrNull()
        value != null && value in 0..255 && part == value.toString()
      }
    }

    private fun unquote(value: String?): String? {
      if (value.isNullOrBlank()) {
        return null
      }
      val trimmed = value.trim().removePrefix("\"").removeSuffix("\"")
      if (trimmed.isBlank() || trimmed == "<unknown ssid>" || trimmed == "<none>") {
        return null
      }
      return trimmed
    }
  }
}
