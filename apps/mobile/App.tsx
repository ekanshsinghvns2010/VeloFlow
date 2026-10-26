
import React from "react";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>V</Text>
        </View>

        <Text style={styles.title}>VeloFlow</Text>
        <Text style={styles.subtitle}>
          Workflow automation, wherever you go.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome to VeloFlow</Text>
          <Text style={styles.cardDescription}>
            Your mobile workspace for managing automated workflows.
          </Text>
          <Text style={styles.status}>Mobile app foundation ready</Text>
        </View>

        <Text style={styles.footer}>
          Connect. Automate. Simplify.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#6658f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "800",
  },
  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
  },
  subtitle: {
    color: "#a5afc8",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  card: {
    backgroundColor: "#151d32",
    borderColor: "#29334c",
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginTop: 32,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "700",
  },
  cardDescription: {
    color: "#a5afc8",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  status: {
    color: "#83e1b0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 20,
  },
  footer: {
    color: "#7d89a5",
    fontSize: 13,
    textAlign: "center",
    marginTop: 36,
  },
});
