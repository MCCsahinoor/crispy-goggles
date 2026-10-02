import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Linking, Pressable, View } from "react-native";

import { Text } from "../lib/disableFontScaling";

import {
  FILORA_PRIVACY_URL,
  FILORA_WEBSITE_URL,
  FILORA_WINDOWS_DOWNLOAD_URL,
} from "../lib/links";
import { gradients, heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import ModalFrame from "./ModalFrame";

type HowToUseModalProps = {
  visible: boolean;
  onClose: () => void;
};

type Step = {
  number: string;
  title: string;
  body: string;
  bullets?: string[];
};

const STEPS: Step[] = [
  {
    number: "1",
    title: "Install both apps",
    body: "Filora Mobile is the phone companion for Filora on Windows. No account or USB cable is required.",
    bullets: [
      "Keep this Android app installed.",
      "On your PC, download Filora for Windows, extract the archive, and run Filora.exe.",
    ],
  },
  {
    number: "2",
    title: "Choose a sharing mode on the PC",
    body: "Open Filora.exe and pick the same mode you will use on this phone.",
    bullets: [
      "Global link — best when the phone is on mobile data or a different network. The PC creates a temporary public HTTPS link.",
      "Local network — best when the phone and PC are on the same Wi-Fi or the PC hotspot. Transfers stay on your network.",
    ],
  },
  {
    number: "3",
    title: "Add files on your Windows PC",
    body: "In Filora Desktop, add the photos, documents, videos, or archives you want to share. Sharing stays active until you stop it on the PC.",
  },
  {
    number: "4",
    title: "Receive files on this phone",
    body: "Open the Received tab and match the PC mode.",
    bullets: [
      "Global link: paste the share URL, or tap Scan Share QR, then Connect. Mobile data works.",
      "Local network: tap Scan Wi-Fi QR and join the PC network, then scan the Share QR or paste the local link (for example http://192.168.x.x:8765/s/...), then Connect.",
      "If the PC owner set a password, enter it when asked.",
    ],
  },
  {
    number: "5",
    title: "Save files to your phone",
    body: "Browse the shared list and tap Save on any file. Downloads go into a Filora folder on this device, typically Documents/Filora. You can change the folder in Settings.",
  },
  {
    number: "6",
    title: "Send files from phone to PC",
    body: "Use the Send tab when you want the opposite direction.",
    bullets: [
      "Pick one or more files on your phone.",
      "Show the QR code in this app.",
      "On the PC, open Filora Desktop → Receive from phone → scan this QR.",
      "If the PC has no camera, tap Copy under the QR and paste the code in Filora Desktop.",
      "Phone and PC must be on the same Wi-Fi or the PC hotspot.",
    ],
  },
];

type HelpLink = { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; url: string };

/** Pinned above "Got it" so it is always visible while the steps scroll. */
const WINDOWS_DOWNLOAD_LINK: HelpLink = {
  icon: "desktop-outline",
  title: "Download for Windows",
  subtitle: "Get Filora.exe for Windows 10/11",
  url: FILORA_WINDOWS_DOWNLOAD_URL,
};

const LINKS: HelpLink[] = [
  {
    icon: "globe-outline",
    title: "Official website",
    subtitle: "Features, FAQ, and how Filora works",
    url: FILORA_WEBSITE_URL,
  },
  {
    icon: "shield-outline",
    title: "Privacy policy",
    subtitle: "How Filora handles your files",
    url: FILORA_PRIVACY_URL,
  },
];

export default function HowToUseModal({ visible, onClose }: HowToUseModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const renderLink = (link: HelpLink) => (
    <Pressable
      key={link.url}
      onPress={() => Linking.openURL(link.url)}
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <View style={styles.linkIcon}>
        <Ionicons name={link.icon} size={18} color={colors.blueSoft} />
      </View>
      <View style={styles.linkCopy}>
        <Text style={styles.linkTitle}>{link.title}</Text>
        <Text style={styles.linkSubtitle}>{link.subtitle}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.blueSoft} />
    </Pressable>
  );

  return (
    <ModalFrame
      visible={visible}
      onClose={onClose}
      gap={14}
      accessibilityLabel="Close how to use"
      header={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>How to use Filora</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.iconClose, pressed && styles.pressed]}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.intro}>
            Follow these steps to share files between your Windows PC and this phone. No account needed.
          </Text>
        </View>
      }
      footer={
        <View style={styles.footer}>
          {renderLink(WINDOWS_DOWNLOAD_LINK)}
          <Pressable
            onPress={onClose}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={gradients.connect}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.closeGradient}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.closeText}>Got it</Text>
            </LinearGradient>
          </Pressable>
        </View>
      }
    >
      {STEPS.map((step) => (
        <View key={step.number} style={styles.stepRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>{step.number}</Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
            {step.bullets?.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.linksHeading}>Helpful links</Text>
      {LINKS.map(renderLink)}
    </ModalFrame>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    header: {
      gap: 8,
    },
    titleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 12,
    },
    title: {
      ...heading(600),
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 16,
      lineHeight: 23,
    },
    iconClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    intro: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    stepRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      alignSelf: "stretch" as const,
      gap: 12,
    },
    stepBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginTop: 1,
    },
    stepNumber: {
      color: colors.blueSoft,
      fontSize: 13,
      fontWeight: "800" as const,
    },
    stepCopy: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      gap: 6,
    },
    stepTitle: {
      ...heading(600),
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    stepBody: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    bulletRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      alignSelf: "stretch" as const,
      gap: 8,
    },
    bulletDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.blueSoft,
      marginTop: 7,
    },
    bulletText: {
      ...para(500),
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    linksHeading: {
      ...heading(),
      color: colors.blueSoft,
      fontSize: 13,
      marginTop: 4,
    },
    linkRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      alignSelf: "stretch" as const,
      gap: 12,
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    linkIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.inputBg,
    },
    linkCopy: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      gap: 2,
    },
    linkTitle: {
      ...heading(600),
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
    },
    linkSubtitle: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    footer: {
      paddingTop: 4,
      gap: 8,
    },
    close: {
      borderRadius: radius.md,
      overflow: "hidden" as const,
    },
    closeGradient: {
      minHeight: 48,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
    },
    closeText: {
      ...para(700),
      color: "#FFFFFF",
      fontSize: 16,
      backgroundColor: "transparent",
      lineHeight: 23,
    },
    pressed: {
      opacity: 0.75,
    },
  };
}
