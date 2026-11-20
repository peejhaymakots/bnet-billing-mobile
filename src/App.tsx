import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://bnetbilling.thebathan.com").replace(/\/+$/, "");
const TOKEN_KEY = "bnet.mobileToken";

type Tab = "home" | "bills" | "pay" | "proofs" | "account";

type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  isVip: boolean;
};

type Dashboard = {
  user: User;
  totals: { outstanding: number; overdue: number; pending: number; credit: number; netOutstanding: number };
  subscriptions: Subscription[];
  bills: Bill[];
  proofs: Proof[];
  notices: { kind: string; title: string; message: string }[];
  announcements: { id: number; title: string; body: string; publishDate: string }[];
};

type Subscription = {
  subscriptionId: number;
  name: string;
  planName: string;
  speed: string;
  monthlyPrice: number;
  billingDay: number;
  status: string;
};

type Bill = {
  id: number;
  planName: string;
  billMonth: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
  note: string | null;
};

type Payment = {
  id: number;
  paymentCode: string;
  amount: number;
  method: string;
  paymentDate: string;
  reference: string | null;
  unappliedAmount: number;
  allocations: { billId: number; billMonth: string; appliedAmount: number }[];
};

type PaymentMethod = {
  id: number;
  name: string;
  instructions: string;
  qrUrl: string;
  downloadUrl: string;
};

type Proof = {
  id: number;
  claimedAmount: number;
  paymentDate: string;
  method: string;
  reference: string | null;
  originalFilename: string;
  status: string;
  displayStatus: string;
  adminNote: string | null;
  createdAt: string;
  canModify: boolean;
};

type PickedFile = {
  uri: string;
  name: string;
  type: string;
};

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [error, setError] = useState("");

  const api = useMemo(() => createApi(token), [token]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setError("");
    const [dashboardData, billsData, paymentsData, methodsData, proofsData] = await Promise.all([
      api.get<{ user: User } & Dashboard>("/api/mobile/dashboard"),
      api.get<{ bills: Bill[] }>("/api/mobile/bills"),
      api.get<{ payments: Payment[] }>("/api/mobile/payments"),
      api.get<{ paymentMethods: PaymentMethod[] }>("/api/mobile/payment-methods"),
      api.get<{ proofs: Proof[] }>("/api/mobile/proofs"),
    ]);
    setDashboard(dashboardData);
    setBills(billsData.bills);
    setPayments(paymentsData.payments);
    setPaymentMethods(methodsData.paymentMethods);
    setProofs(proofsData.proofs);
  }, [api, token]);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((stored) => setToken(stored))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    loadAll()
      .catch((err) => {
        if (err.status === 401) {
          SecureStore.deleteItemAsync(TOKEN_KEY);
          setToken(null);
        }
        setError(err.message || "Unable to load billing data.");
      })
      .finally(() => setLoading(false));
  }, [loadAll, token]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  async function handleLogin(email: string, password: string) {
    setLoading(true);
    setError("");
    try {
      const result = await createApi(null).post<{ token: string; user: User }>("/api/mobile/login", {
        email,
        password,
        deviceName: `${Platform.OS} device`,
        platform: Platform.OS,
      });
      await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      setToken(result.token);
      setTab("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      if (token) await api.post("/api/mobile/logout", {});
    } catch {
      // Local sign-out should still happen if the server is offline.
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setDashboard(null);
    setTab("home");
  }

  async function handlePasswordChange(currentPassword: string, newPassword: string, confirmPassword: string) {
    setLoading(true);
    try {
      await api.post("/api/mobile/account/password", { currentPassword, newPassword, confirmPassword });
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
      Alert.alert("Password changed", "Please log in again with your new password.");
    } catch (err) {
      Alert.alert("Password not changed", err instanceof Error ? err.message : "Please check your password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleProofUpload(values: ProofFormValues) {
    setLoading(true);
    try {
      await api.multipart("/api/mobile/proofs", proofFormData(values));
      await refresh();
      setTab("proofs");
      Alert.alert("Proof submitted", "Your proof of payment is now waiting for admin verification.");
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleProofReplace(proof: Proof, file: PickedFile) {
    setLoading(true);
    try {
      await api.multipart(`/api/mobile/proofs/${proof.id}/replace`, proofFormData({
        amount: String(proof.claimedAmount),
        paymentDate: proof.paymentDate,
        method: proof.method,
        reference: proof.reference || "",
        file,
      }));
      await refresh();
    } catch (err) {
      Alert.alert("Replace failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleProofDelete(proof: Proof) {
    Alert.alert("Delete proof?", "This removes the proof while it is still pending or rejected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            await api.post(`/api/mobile/proofs/${proof.id}/delete`, {});
            await refresh();
          } catch (err) {
            Alert.alert("Delete failed", err instanceof Error ? err.message : "Please try again.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  if (booting) return <LoadingScreen />;
  if (!token) return <LoginScreen loading={loading} error={error} onLogin={handleLogin} />;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>B-Net Billing</Text>
          <Text style={styles.headerSub}>{dashboard?.user.name || "Client account"}</Text>
        </View>
        {loading ? <ActivityIndicator color="#0f766e" /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentPad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {tab === "home" ? <HomeScreen dashboard={dashboard} loading={loading} /> : null}
        {tab === "bills" ? <BillsScreen bills={bills} /> : null}
        {tab === "pay" ? <PayScreen methods={paymentMethods} onUpload={handleProofUpload} /> : null}
        {tab === "proofs" ? <ProofsScreen proofs={proofs} onReplace={handleProofReplace} onDelete={handleProofDelete} /> : null}
        {tab === "account" ? <AccountScreen user={dashboard?.user || null} onPasswordChange={handlePasswordChange} onLogout={handleLogout} /> : null}
      </ScrollView>
      <BottomTabs active={tab} onChange={setTab} />
    </SafeAreaView>
  );
}

function LoginScreen({ loading, error, onLogin }: { loading: boolean; error: string; onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <SafeAreaView style={styles.loginShell}>
      <StatusBar style="dark" />
      <View style={styles.loginPanel}>
        <View style={styles.logoMark}><Text style={styles.logoText}>BN</Text></View>
        <Text style={styles.loginTitle}>B-Net Billing</Text>
        <Text style={styles.loginSub}>Client billing, payments, and proof uploads.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Pressable style={styles.primaryButton} disabled={loading} onPress={() => onLogin(email, password)}>
          <Text style={styles.primaryButtonText}>{loading ? "Signing in..." : "Sign in"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({ dashboard, loading }: { dashboard: Dashboard | null; loading: boolean }) {
  if (!dashboard && loading) return <LoadingScreen />;
  if (!dashboard) return <EmptyState title="No data loaded" text="Pull down to refresh your billing account." />;
  return (
    <View>
      <View style={styles.balancePanel}>
        <Text style={styles.panelLabel}>Total outstanding</Text>
        <Text style={styles.balanceText}>{money(dashboard.totals.netOutstanding)}</Text>
        <Text style={styles.muted}>Credit: {money(dashboard.totals.credit)} | For verification: {money(dashboard.totals.pending)}</Text>
      </View>
      <View style={styles.grid2}>
        <Metric label="Overdue" value={money(dashboard.totals.overdue)} tone={dashboard.totals.overdue > 0 ? "bad" : "good"} />
        <Metric label="Active plans" value={String(dashboard.subscriptions.length)} />
      </View>
      {dashboard.notices.map((notice) => <Notice key={`${notice.kind}-${notice.title}`} title={notice.title} text={notice.message} />)}
      <Section title="Plans">
        {dashboard.subscriptions.length ? dashboard.subscriptions.map((sub) => <PlanCard key={sub.subscriptionId} sub={sub} />) : <Text style={styles.muted}>No active plan.</Text>}
      </Section>
      <Section title="Latest bills">
        {dashboard.bills.slice(0, 4).map((bill) => <BillRow key={bill.id} bill={bill} />)}
      </Section>
      <Section title="Announcements">
        {dashboard.announcements.length ? dashboard.announcements.map((a) => <Notice key={a.id} title={a.title} text={a.body} />) : <Text style={styles.muted}>No current announcements.</Text>}
      </Section>
    </View>
  );
}

function BillsScreen({ bills }: { bills: Bill[] }) {
  return <Section title="Bills">{bills.length ? bills.map((bill) => <BillRow key={bill.id} bill={bill} />) : <EmptyState title="No bills" text="Your bill history will appear here." />}</Section>;
}

function PayScreen({ methods, onUpload }: { methods: PaymentMethod[]; onUpload: (values: ProofFormValues) => void }) {
  return (
    <View>
      <Section title="Payment methods">
        {methods.length ? methods.map((method) => <PaymentMethodCard key={method.id} method={method} />) : <Text style={styles.muted}>No active payment methods.</Text>}
      </Section>
      <ProofUploadForm methods={methods} onSubmit={onUpload} />
    </View>
  );
}

function ProofsScreen({ proofs, onReplace, onDelete }: { proofs: Proof[]; onReplace: (proof: Proof, file: PickedFile) => void; onDelete: (proof: Proof) => void }) {
  return (
    <Section title="Proof history">
      {proofs.length ? proofs.map((proof) => <ProofCard key={proof.id} proof={proof} onReplace={onReplace} onDelete={onDelete} />) : <EmptyState title="No proofs" text="Uploaded payment proofs will appear here." />}
    </Section>
  );
}

function AccountScreen({ user, onPasswordChange, onLogout }: { user: User | null; onPasswordChange: (currentPassword: string, newPassword: string, confirmPassword: string) => void; onLogout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  return (
    <View>
      <Section title="Account">
        <Text style={styles.titleText}>{user?.name || "Client"}</Text>
        <Text style={styles.muted}>{user?.email}</Text>
        {user?.phone ? <Text style={styles.muted}>{user.phone}</Text> : null}
        {user?.address ? <Text style={styles.muted}>{user.address}</Text> : null}
      </Section>
      <Section title="Change password">
        <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
        <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
        <Field label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        <Pressable style={styles.primaryButton} onPress={() => onPasswordChange(currentPassword, newPassword, confirmPassword)}>
          <Text style={styles.primaryButtonText}>Update password</Text>
        </Pressable>
      </Section>
      <Pressable style={styles.secondaryButton} onPress={onLogout}>
        <Text style={styles.secondaryButtonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

function BottomTabs({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "home", label: "Home", icon: "home-outline" },
    { key: "bills", label: "Bills", icon: "receipt-outline" },
    { key: "pay", label: "Pay", icon: "qr-code-outline" },
    { key: "proofs", label: "Proofs", icon: "document-attach-outline" },
    { key: "account", label: "Account", icon: "person-outline" },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable key={tab.key} style={styles.tabButton} onPress={() => onChange(tab.key)}>
          <Ionicons name={tab.icon} size={22} color={active === tab.key ? "#0f766e" : "#64748b"} />
          <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type ProofFormValues = {
  amount: string;
  paymentDate: string;
  method: string;
  reference: string;
  file: PickedFile | null;
};

function ProofUploadForm({ methods, onSubmit }: { methods: PaymentMethod[]; onSubmit: (values: ProofFormValues) => void }) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(methods[0]?.name || "GCash");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const methodNames = methods.length ? methods.map((m) => m.name) : ["GCash", "Maribank", "ShopeePay", "Bank Transfer", "Cash"];

  useEffect(() => {
    if (!methods.length || method) return;
    setMethod(methods[0].name);
  }, [method, methods]);

  return (
    <Section title="Upload proof">
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Field label="Payment date" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" />
      <View style={styles.segmentWrap}>
        {methodNames.map((name) => (
          <Pressable key={name} style={[styles.segment, method === name && styles.segmentActive]} onPress={() => setMethod(name)}>
            <Text style={[styles.segmentText, method === name && styles.segmentTextActive]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Reference number" value={reference} onChangeText={setReference} placeholder="Optional" />
      <View style={styles.fileActions}>
        <Pressable style={styles.secondaryButton} onPress={async () => setFile(await pickImage())}>
          <Ionicons name="camera-outline" size={18} color="#0f766e" />
          <Text style={styles.secondaryButtonText}>Camera or gallery</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={async () => setFile(await pickDocument())}>
          <Ionicons name="document-outline" size={18} color="#0f766e" />
          <Text style={styles.secondaryButtonText}>PDF/file</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>{file ? file.name : "JPG, PNG, or PDF up to 5MB. Cash can be submitted without a file."}</Text>
      <Pressable style={styles.primaryButton} onPress={() => onSubmit({ amount, paymentDate, method, reference, file })}>
        <Text style={styles.primaryButtonText}>Submit proof</Text>
      </Pressable>
    </Section>
  );
}

function PaymentMethodCard({ method }: { method: PaymentMethod }) {
  const [preview, setPreview] = useState(false);
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.titleText}>{method.name}</Text>
          <Text style={styles.muted}>{method.instructions}</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => setPreview(true)}>
          <Ionicons name="qr-code-outline" size={24} color="#0f766e" />
        </Pressable>
      </View>
      <Pressable onPress={() => Linking.openURL(method.downloadUrl)}><Text style={styles.linkText}>Open QR code</Text></Pressable>
      <Modal visible={preview} animationType="slide" onRequestClose={() => setPreview(false)}>
        <SafeAreaView style={styles.modalShell}>
          <Pressable style={styles.closeButton} onPress={() => setPreview(false)}><Ionicons name="close" size={26} color="#102a43" /></Pressable>
          <Text style={styles.loginTitle}>{method.name}</Text>
          <Text style={styles.muted}>{method.instructions}</Text>
          <View style={styles.qrFrame}>
            <Image source={{ uri: method.qrUrl }} style={styles.qrImage} resizeMode="contain" />
          </View>
          <Pressable style={styles.primaryButton} onPress={() => Linking.openURL(method.qrUrl)}>
            <Text style={styles.primaryButtonText}>Open QR</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ProofCard({ proof, onReplace, onDelete }: { proof: Proof; onReplace: (proof: Proof, file: PickedFile) => void; onDelete: (proof: Proof) => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.titleText}>{money(proof.claimedAmount)}</Text>
          <Text style={styles.muted}>{proof.method} | {proof.paymentDate}</Text>
        </View>
        <StatusBadge status={proof.status} label={proof.displayStatus} />
      </View>
      {proof.reference ? <Text style={styles.muted}>Reference: {proof.reference}</Text> : null}
      {proof.adminNote ? <Text style={styles.noteText}>{proof.adminNote}</Text> : null}
      {proof.canModify ? (
        <View style={styles.inlineActions}>
          <Pressable style={styles.secondaryButton} onPress={async () => {
            const picked = await pickImage();
            if (picked) onReplace(proof, picked);
          }}>
            <Text style={styles.secondaryButtonText}>Replace</Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={() => onDelete(proof)}>
            <Text style={styles.dangerButtonText}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function BillRow({ bill }: { bill: Bill }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.titleText}>{bill.planName}</Text>
          <Text style={styles.muted}>{bill.billMonth} | Due {bill.dueDate}</Text>
        </View>
        <StatusBadge status={bill.status} label={bill.status} />
      </View>
      <View style={styles.billMoneyRow}>
        <Metric label="Amount" value={money(bill.amount)} />
        <Metric label="Paid" value={money(bill.paidAmount)} tone="good" />
        <Metric label="Balance" value={money(bill.balance)} tone={bill.balance > 0 ? "bad" : "good"} />
      </View>
      {bill.note ? <Text style={styles.noteText}>{bill.note}</Text> : null}
    </View>
  );
}

function PlanCard({ sub }: { sub: Subscription }) {
  return (
    <View style={styles.card}>
      <Text style={styles.titleText}>{sub.name}</Text>
      <Text style={styles.muted}>{sub.speed}</Text>
      <Text style={styles.priceText}>{money(sub.monthlyPrice)}/mo</Text>
      <Text style={styles.muted}>Due every day {sub.billingDay}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "good" && styles.goodText, tone === "bad" && styles.badText]}>{value}</Text>
    </View>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = status === "paid" || status === "approved" ? styles.badgeGood : status === "overdue" || status === "rejected" ? styles.badgeBad : styles.badgeWarn;
  return <Text style={[styles.badge, style]}>{label}</Text>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#94a3b8" {...inputProps} />
    </View>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.titleText}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.loginShell}>
      <ActivityIndicator color="#0f766e" />
    </SafeAreaView>
  );
}

function createApi(token: string | null) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return data as T;
  }
  return {
    get: <T,>(path: string) => request<T>(path),
    post: <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
    multipart: <T,>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),
  };
}

function proofFormData(values: ProofFormValues): FormData {
  const form = new FormData();
  form.append("claimed_amount", values.amount);
  form.append("payment_date", values.paymentDate);
  form.append("method", values.method);
  form.append("reference", values.reference);
  if (values.file) {
    form.append("proof_file", {
      uri: values.file.uri,
      name: values.file.name,
      type: values.file.type,
    } as unknown as Blob);
  }
  return form;
}

async function pickImage(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.fileName || `proof-${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" };
}

async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "application/pdf"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, type: asset.mimeType || "application/octet-stream" };
}

function money(value: number): string {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: "#f6f8fb" },
  loginShell: { flex: 1, backgroundColor: "#f6f8fb", alignItems: "center", justifyContent: "center", padding: 20 },
  loginPanel: { width: "100%", maxWidth: 420, gap: 14 },
  logoMark: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 22, fontWeight: "900" },
  loginTitle: { fontSize: 30, fontWeight: "900", color: "#102a43" },
  loginSub: { fontSize: 16, color: "#52616b" },
  header: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 20, fontWeight: "900", color: "#0f3f3b" },
  headerSub: { color: "#64748b", marginTop: 2 },
  content: { flex: 1 },
  contentPad: { padding: 16, paddingBottom: 110 },
  balancePanel: { backgroundColor: "#0f3f3b", borderRadius: 8, padding: 18, marginBottom: 14 },
  panelLabel: { color: "#b8fff4", fontWeight: "700" },
  balanceText: { color: "#fff", fontSize: 32, fontWeight: "900", marginVertical: 8 },
  grid2: { flexDirection: "row", gap: 10 },
  section: { marginBottom: 18, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#102a43" },
  card: { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", padding: 14, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  flex: { flex: 1 },
  titleText: { fontSize: 16, fontWeight: "800", color: "#102a43" },
  muted: { color: "#64748b", lineHeight: 20 },
  priceText: { fontSize: 20, fontWeight: "900", color: "#0f766e" },
  metricBox: { flex: 1, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", padding: 12, minHeight: 76 },
  metricLabel: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  metricValue: { color: "#102a43", fontWeight: "900", fontSize: 16, marginTop: 6 },
  goodText: { color: "#15803d" },
  badText: { color: "#b91c1c" },
  notice: { backgroundColor: "#e6fffb", borderWidth: 1, borderColor: "#99f6e4", borderRadius: 8, padding: 12, gap: 4 },
  noticeTitle: { color: "#0f3f3b", fontWeight: "900" },
  noticeText: { color: "#315b57" },
  error: { backgroundColor: "#fee2e2", color: "#991b1b", padding: 10, margin: 12, borderRadius: 8 },
  field: { gap: 6 },
  fieldLabel: { color: "#475569", fontSize: 13, fontWeight: "800" },
  input: { backgroundColor: "#fff", borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 8, minHeight: 46, paddingHorizontal: 12, color: "#102a43" },
  primaryButton: { minHeight: 48, borderRadius: 8, backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center", paddingHorizontal: 14, flexDirection: "row", gap: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  secondaryButton: { minHeight: 44, borderRadius: 8, backgroundColor: "#e6fffb", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, flexDirection: "row", gap: 8 },
  secondaryButtonText: { color: "#0f766e", fontWeight: "900" },
  dangerButton: { minHeight: 44, borderRadius: 8, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  dangerButtonText: { color: "#991b1b", fontWeight: "900" },
  billMoneyRow: { flexDirection: "row", gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, overflow: "hidden", fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  badgeGood: { backgroundColor: "#dcfce7", color: "#166534" },
  badgeBad: { backgroundColor: "#fee2e2", color: "#991b1b" },
  badgeWarn: { backgroundColor: "#fef3c7", color: "#92400e" },
  tabs: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb", flexDirection: "row", paddingBottom: 8, paddingTop: 8 },
  tabButton: { flex: 1, alignItems: "center", gap: 3 },
  tabLabel: { color: "#64748b", fontSize: 11, fontWeight: "800" },
  tabLabelActive: { color: "#0f766e" },
  segmentWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segment: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1" },
  segmentActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  segmentText: { color: "#475569", fontWeight: "800" },
  segmentTextActive: { color: "#fff" },
  fileActions: { gap: 10 },
  iconButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#e6fffb", alignItems: "center", justifyContent: "center" },
  inlineActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  linkText: { color: "#0f766e", fontWeight: "900" },
  noteText: { backgroundColor: "#f8fafc", color: "#475569", borderRadius: 8, padding: 10 },
  empty: { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", padding: 18, gap: 4 },
  modalShell: { flex: 1, backgroundColor: "#f6f8fb", padding: 20, gap: 16 },
  closeButton: { alignSelf: "flex-end", width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  qrFrame: { aspectRatio: 1, borderRadius: 8, backgroundColor: "#fff", borderColor: "#e5e7eb", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qrImage: { width: "92%", height: "92%" },
});
