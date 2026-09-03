"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type ProfilePhoto = { id: string; storage_path: string; is_primary: boolean; position: number; url: string };
type RoomPerson = { id?: string; name: string; age: number | null; area: string; note: string; tags: string[]; initials: string; gender?: string | null; interestedIn?: string[]; preferredMinAge?: number; preferredMaxAge?: number; photoPosition?: string; photoUrl?: string; tone: string; online: boolean; sample?: boolean };
type InvitationItem = { id: string; body: string; broad_area: string | null; created_at: string; expires_at: string; author: RoomPerson; roomName: string };
type IntroductionItem = { id: string; sender_id: string; recipient_id: string; message: string; state: "pending" | "accepted" | "passed" | "reported"; created_at: string; personName: string; incoming: boolean };
type DirectMessage = { id: string; conversation_id: string; sender_id: string; recipient_id: string; body: string; read_at: string | null; created_at: string };
type RoomChatMessage = { id: string; room_id: string; sender_id: string; body: string; created_at: string; senderName: string };
type ConversationItem = { id: string; member_a: string; member_b: string; otherId: string; otherName: string; last_message_at: string; unread: number; preview: string };
type VerificationReview = { user_id: string; username: string; birth_date: string | null; status: string; submitted_at: string | null; accountState: string };
type SafetyReport = { id: string; reporter_id: string; reported_id: string; reason: string; status: string; created_at: string };

async function prepareProfilePhoto(file: File) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("We couldn’t prepare that photo.")), "image/jpeg", .84));
}

function friendlyError(error: unknown, fallback = "Something went wrong. Please try again.") {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("account no longer exists") || normalized.includes("accounts_user_id_fkey")) return "This sign-in belongs to an account that no longer exists. Please sign in again or create a new account.";
  if (normalized.includes("row-level security") || normalized.includes("permission denied")) return "Your session no longer has permission to do that. Please sign out, sign back in, and try once more.";
  if (normalized.includes("duplicate") || normalized.includes("unique constraint")) return "That has already been submitted.";
  if (normalized.includes("rate") || normalized.includes("too many") || normalized.includes("slow down")) return "You’re moving a little quickly. Please wait a moment and try again.";
  if (normalized.includes("jwt") || normalized.includes("session") || normalized.includes("unauthorized")) return "Your secure session expired. Please sign in again.";
  return message || fallback;
}

const people: RoomPerson[] = [
  { name: "CityFern", age: 31, area: "West side", note: "Museum afternoons, tiny restaurants, and laughing too loudly.", tags: ["Long-term", "Art", "Food"], initials: "CF", photoPosition: "0% 0%", tone: "coral", online: true, sample: true },
  { name: "MilesAhead", age: 34, area: "North side", note: "Weekend cyclist. Weeknight cook. Looking for something steady.", tags: ["Long-term", "Outdoors", "Cooking"], initials: "MA", photoPosition: "50% 0%", tone: "sky", online: true, sample: true },
  { name: "SundayStatic", age: 29, area: "Center city", note: "Live music, used bookstores, and a very opinionated rescue dog.", tags: ["Dating", "Music", "Dogs"], initials: "SS", photoPosition: "100% 0%", tone: "gold", online: true, sample: true },
  { name: "ClayAndCoffee", age: 36, area: "East side", note: "Architect, amateur potter, professional finder of good coffee.", tags: ["Relationship", "Design", "Coffee"], initials: "CC", photoPosition: "0% 100%", tone: "plum", online: true, sample: true },
  { name: "JuniperJune", age: 32, area: "South side", note: "Equal parts homebody and last-minute road trip.", tags: ["Dating", "Travel", "Books"], initials: "JJ", photoPosition: "50% 100%", tone: "mint", online: false, sample: true },
  { name: "HeyItsRae", age: 30, area: "Within 10 miles", note: "Sunday brunch host. Terrible at trivia. Excellent teammate.", tags: ["Long-term", "Friends first", "Brunch"], initials: "HR", photoPosition: "100% 100%", tone: "rose", online: false, sample: true },
];

const rooms = [
  { name: "Things to do tonight", icon: "✦", color: "#ffb8d0" },
  { name: "Live music", icon: "♫", color: "#bca9ff" },
  { name: "Food & coffee", icon: "☕", color: "#edcf78" },
  { name: "Outdoors", icon: "☀", color: "#91e7dc" },
  { name: "Books & art", icon: "◌", color: "#f5b49f" },
];

const genderOptions = ["Woman", "Man", "Nonbinary", "Genderfluid", "Agender", "Self-described"];

export default function Home() {
  const [browserReady, setBrowserReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [adultVerified, setAdultVerified] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState("inactive");
  const [hasBillingAccount, setHasBillingAccount] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [modal, setModal] = useState<"verify" | "onboarding" | "profile" | "hello" | "invite" | "messages" | "chat" | "roomchat" | "report" | "filters" | "admin" | "account" | null>(null);
  const [selected, setSelected] = useState<RoomPerson | null>(null);
  const [sent, setSent] = useState(false);
  const [introductionText, setIntroductionText] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const strongPassword = password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot" | "recovery">("signin");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [username, setUsername] = useState("");
  const [broadArea, setBroadArea] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [intention, setIntention] = useState("");
  const [gender, setGender] = useState("");
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [myAge, setMyAge] = useState<number | null>(null);
  const [preferredMinAge, setPreferredMinAge] = useState(18);
  const [preferredMaxAge, setPreferredMaxAge] = useState(99);
  const [compatibilityMode, setCompatibilityMode] = useState<"suggested" | "strict">("suggested");
  const [discoverable, setDiscoverable] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("unverified");
  const [inviteText, setInviteText] = useState("");
  const [inviteRoom, setInviteRoom] = useState("Things to do tonight");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [hiddenPeople, setHiddenPeople] = useState<string[]>([]);
  const [draggingPerson, setDraggingPerson] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pinnedPeople, setPinnedPeople] = useState<string[]>([]);
  const [locationReady, setLocationReady] = useState(false);
  const [nearbyOrder, setNearbyOrder] = useState<string[]>([]);
  const [roomOffset, setRoomOffset] = useState({ x: 0, y: 0 });
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeMoved = useRef(false);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [activeRoom, setActiveRoom] = useState("Food & coffee");
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomPeople, setRoomPeople] = useState<RoomPerson[]>([]);
  const [roomMemberCount, setRoomMemberCount] = useState(0);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomMessages, setRoomMessages] = useState<RoomChatMessage[]>([]);
  const [roomMessageText, setRoomMessageText] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [introductions, setIntroductions] = useState<IntroductionItem[]>([]);
  const [activityVersion, setActivityVersion] = useState(0);
  const [filterMinAge, setFilterMinAge] = useState(18);
  const [filterMaxAge, setFilterMaxAge] = useState(99);
  const [filterIntention, setFilterIntention] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [filterGender, setFilterGender] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [verificationReviews, setVerificationReviews] = useState<VerificationReview[]>([]);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [reportTarget, setReportTarget] = useState<{id:string;name:string} | null>(null);
  const [reportReason, setReportReason] = useState("Harassment or unwanted contact");
  const [reportDetails, setReportDetails] = useState("");

  const loadPhotos = async (userId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("profile_photos").select("id, storage_path, is_primary, position").eq("user_id", userId).order("position");
    const withUrls = await Promise.all((data ?? []).map(async photo => {
      const { data: signed } = await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 3600);
      return { ...photo, url: signed?.signedUrl ?? "" };
    }));
    setPhotos(withUrls);
  };

  useEffect(() => {
    setBrowserReady(true);
    const membershipResult = new URLSearchParams(window.location.search).get("membership");
    if (membershipResult === "success") setAuthMessage("Payment received. Your room access will switch on as soon as Stripe confirms it—usually within a few seconds.");
    if (membershipResult === "canceled") setAuthMessage("Checkout was canceled. Nothing was charged.");
    if (!supabase) return;
    const refreshAccess = async (userId?: string) => {
      setSignedIn(Boolean(userId));
      setUserId(userId ?? null);
      if (!userId) { setVerified(false); setAdultVerified(false); setMembershipStatus("inactive"); setHasBillingAccount(false); setProfileReady(false); setIsAdmin(false); return; }
      const { data: userData } = await supabase.auth.getUser();
      setIsAdmin(userData.user?.app_metadata?.role === "admin");
      const [{ data: account }, { data: profile }, { data: request }] = await Promise.all([
        supabase.from("accounts").select("state, verification, membership_active, membership_status, stripe_customer_id").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("username, age, broad_area, interests, bio, intentions, gender, interested_in, preferred_min_age, preferred_max_age, compatibility_mode, discoverable").eq("user_id", userId).maybeSingle(),
        supabase.from("verification_requests").select("status").eq("user_id", userId).maybeSingle(),
      ]);
      setProfileReady(Boolean(profile));
      if (profile) { setUsername(profile.username); setMyAge(profile.age ?? null); setBroadArea(profile.broad_area ?? ""); setInterests(profile.interests ?? []); setBio(profile.bio ?? ""); setIntention(profile.intentions?.[0] ?? ""); setGender(profile.gender ?? ""); setInterestedIn(profile.interested_in ?? []); setPreferredMinAge(profile.preferred_min_age ?? 18); setPreferredMaxAge(profile.preferred_max_age ?? 99); setCompatibilityMode(profile.compatibility_mode === "strict" ? "strict" : "suggested"); setDiscoverable(profile.discoverable ?? false); }
      setVerificationStatus(request?.status ?? account?.verification ?? "unverified");
      setAdultVerified(account?.state === "active" && account?.verification === "verified");
      setMembershipStatus(account?.membership_status ?? (account?.membership_active ? "active" : "inactive"));
      setHasBillingAccount(Boolean(account?.stripe_customer_id));
      setVerified(account?.state === "active" && account?.verification === "verified" && account?.membership_active === true);
      if (profile) await loadPhotos(userId);
      if (!profile) setModal("onboarding");
      else if (membershipResult === "success" && !account?.membership_active) setModal("onboarding");
      else setModal(null);
    };
    const refreshTimers: number[] = [];
    supabase.auth.getSession().then(({ data }) => {
      void refreshAccess(data.session?.user.id);
      if (membershipResult === "success" && data.session?.user.id) {
        [2000, 5000, 10000].forEach(delay => refreshTimers.push(window.setTimeout(() => void refreshAccess(data.session?.user.id), delay)));
      }
    });
    const refreshOnFocus = () => { void supabase.auth.getSession().then(({data}) => refreshAccess(data.session?.user.id)); };
    window.addEventListener("focus", refreshOnFocus);
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => { if (event === "PASSWORD_RECOVERY") { setAuthMode("recovery"); setModal("verify"); } window.setTimeout(() => void refreshAccess(session?.user.id), 0); });
    return () => { listener.subscription.unsubscribe(); refreshTimers.forEach(window.clearTimeout); window.removeEventListener("focus", refreshOnFocus); };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  useEffect(() => {
    const savedPins = window.localStorage.getItem("meet-freely-pins");
    if (savedPins) { try { setPinnedPeople(JSON.parse(savedPins)); } catch { window.localStorage.removeItem("meet-freely-pins"); } }
    const closeOverlays = (event: KeyboardEvent) => { if (event.key === "Escape") { setModal(null); setMobileMenuOpen(false); setInstallHelpOpen(false); } };
    window.addEventListener("keydown", closeOverlays);
    return () => window.removeEventListener("keydown", closeOverlays);
  }, []);

  useEffect(() => { window.localStorage.setItem("meet-freely-pins", JSON.stringify(pinnedPeople)); }, [pinnedPeople]);

  useEffect(() => {
    if (!supabase || !verified || !userId) { setRoomPeople([]); setRoomMessages([]); setRoomMemberCount(0); setActiveRoomId(null); return; }
    let active = true;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    const loadRoom = async () => {
      setRoomLoading(true);
      const { data: room, error: roomError } = await supabase.from("rooms").select("id").eq("name", activeRoom).maybeSingle();
      if (!room || roomError || !active) { setRoomLoading(false); if (active) setAuthMessage(friendlyError(roomError, "That room could not be opened. Please try another room.")); return; }
      setActiveRoomId(room.id);
      const { error: joinError } = await supabase.from("room_members").upsert({ room_id: room.id, user_id: userId, state: "active", last_seen_at: new Date().toISOString() }, { onConflict: "room_id,user_id" });
      if (joinError) { setRoomLoading(false); setAuthMessage(friendlyError(joinError, "You could not join that room.")); return; }
      const { data: members, error: memberError } = await supabase.from("room_members").select("user_id,bubble_color,last_seen_at").eq("room_id", room.id).neq("user_id", userId).neq("state", "left").order("last_seen_at", { ascending: false }).limit(30);
      if (memberError) { setRoomLoading(false); setAuthMessage(friendlyError(memberError, "The people in this room could not be loaded.")); return; }
      const memberIds = (members ?? []).map(member => member.user_id);
      const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("user_id,username,age,broad_area,bio,intentions,interests,gender,interested_in,preferred_min_age,preferred_max_age").in("user_id", memberIds).eq("discoverable", true) : { data: [] };
      const profileIds = (profiles ?? []).map(profile => profile.user_id);
      const { data: photoRows } = profileIds.length ? await supabase.from("profile_photos").select("user_id,storage_path").in("user_id", profileIds).eq("is_primary", true) : { data: [] };
      const photoUrls = new Map<string,string>();
      await Promise.all((photoRows ?? []).map(async photo => { const { data } = await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 3600); if (data?.signedUrl) photoUrls.set(photo.user_id, data.signedUrl); }));
      const onlineIds = new Set<string>();
      const loadRoomMessages = async () => {
        const { data: messageRows } = await supabase.from("room_messages").select("id,room_id,sender_id,body,created_at").eq("room_id", room.id).order("created_at", { ascending: true }).limit(60);
        const senderIds = Array.from(new Set((messageRows ?? []).map(message => message.sender_id)));
        const { data: senderProfiles } = senderIds.length ? await supabase.from("profiles").select("user_id,username").in("user_id", senderIds) : { data: [] };
        const senderNames = new Map((senderProfiles ?? []).map(profile => [profile.user_id, profile.username]));
        if (active) setRoomMessages((messageRows ?? []).map(message => ({ ...message, senderName: message.sender_id === userId ? "You" : senderNames.get(message.sender_id) ?? "Room member" })));
      };
      await loadRoomMessages();
      const syncPresence = () => { onlineIds.clear(); const state = channel?.presenceState<Record<string,string>>() ?? {}; Object.values(state).flat().forEach(entry => { if (entry.user_id) onlineIds.add(entry.user_id); }); };
      channel = supabase.channel(`room:${room.id}`, { config: { presence: { key: userId } } })
        .on("presence", { event: "sync" }, () => { syncPresence(); setRoomPeople(current => current.map(person => ({ ...person, online: person.id ? onlineIds.has(person.id) : person.online }))); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${room.id}` }, () => void loadRoomMessages())
        .subscribe(async status => { if (status === "SUBSCRIBED") await channel?.track({ user_id: userId, room_id: room.id, online_at: new Date().toISOString() }); });
      const memberById = new Map((members ?? []).map(member => [member.user_id, member]));
      const mapped: RoomPerson[] = (profiles ?? []).map(profile => ({ id: profile.user_id, name: profile.username, age: profile.age, area: profile.broad_area || "Nearby area", note: profile.bio || "Say hello and ask what brought them into this room.", tags: [...(profile.intentions ?? []), ...(profile.interests ?? [])].slice(0,4), initials: profile.username.slice(0,2).toUpperCase(), gender:profile.gender, interestedIn:profile.interested_in ?? [], preferredMinAge:profile.preferred_min_age ?? 18, preferredMaxAge:profile.preferred_max_age ?? 99, photoUrl: photoUrls.get(profile.user_id), tone: memberById.get(profile.user_id)?.bubble_color ?? "mint", online: onlineIds.has(profile.user_id), sample: false }));
      if (active) { setRoomPeople(mapped); setRoomMemberCount((members?.length ?? 0) + 1); setRoomLoading(false); }
    };
    void loadRoom();
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, [activeRoom, verified, userId]);

  useEffect(() => {
    if (!supabase || !verified) { setRoomCounts({}); return; }
    let active = true;
    const loadRoomCounts = async () => {
      const entries = await Promise.all(rooms.map(async room => {
        const { data: row } = await supabase.from("rooms").select("id").eq("name", room.name).maybeSingle();
        if (!row) return [room.name, 0] as const;
        const { count } = await supabase.from("room_members").select("user_id", { count: "exact", head: true }).eq("room_id", row.id).neq("state", "left");
        return [room.name, count ?? 0] as const;
      }));
      if (active) setRoomCounts(Object.fromEntries(entries));
    };
    void loadRoomCounts();
    return () => { active = false; };
  }, [verified, activeRoom]);

  useEffect(() => {
    if (!supabase || !verified || !userId) { setInvitations([]); setIntroductions([]); return; }
    let active = true;
    const loadActivity = async () => {
      const [{ data: invitationRows }, { data: introRows }] = await Promise.all([
        supabase.from("open_invitations").select("id,author_id,body,broad_area,created_at,expires_at,rooms(name)").eq("state", "open").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(20),
        supabase.from("introductions").select("id,sender_id,recipient_id,message,state,created_at").order("created_at", { ascending: false }).limit(40),
      ]);
      const personIds = Array.from(new Set([...(invitationRows ?? []).map(row => row.author_id), ...(introRows ?? []).flatMap(row => [row.sender_id,row.recipient_id])])).filter(id => id !== userId);
      const { data: profiles } = personIds.length ? await supabase.from("profiles").select("user_id,username,age,broad_area,bio,intentions,interests,gender").in("user_id", personIds) : { data: [] };
      const profileById = new Map((profiles ?? []).map(profile => [profile.user_id, profile]));
      const toPerson = (id: string): RoomPerson => { const profile = profileById.get(id); return { id, name: profile?.username ?? "Meet Freely member", age: profile?.age ?? null, area: profile?.broad_area ?? "Broad area private", note: profile?.bio ?? "Open their profile to learn more.", tags: [...(profile?.intentions ?? []), ...(profile?.interests ?? [])].slice(0,4), initials: profile?.username?.slice(0,2).toUpperCase() ?? "MF", gender:profile?.gender, tone: "rose", online: roomPeople.some(person => person.id === id && person.online), sample: false }; };
      if (!active) return;
      setInvitations((invitationRows ?? []).map(row => ({ id: row.id, body: row.body, broad_area: row.broad_area, created_at: row.created_at, expires_at: row.expires_at, author: row.author_id === userId ? { id:userId,name:username,age:null,area:broadArea,note:bio,tags:interests,initials:username.slice(0,2).toUpperCase(),tone:"sky",online:true } : toPerson(row.author_id), roomName: Array.isArray(row.rooms) ? row.rooms[0]?.name ?? "Interest room" : (row.rooms as {name?:string}|null)?.name ?? "Interest room" })));
      setIntroductions((introRows ?? []).map(row => { const incoming = row.recipient_id === userId; const otherId = incoming ? row.sender_id : row.recipient_id; return { ...row, incoming, personName: profileById.get(otherId)?.username ?? "Meet Freely member" }; }));
    };
    void loadActivity();
    return () => { active = false; };
  }, [verified, userId, activityVersion, roomPeople, username, broadArea, bio, interests]);

  const loadConversations = async () => {
    if (!supabase || !userId) return;
    const { data: rows } = await supabase.from("conversations").select("id,member_a,member_b,last_message_at").order("last_message_at", { ascending:false });
    const others = (rows ?? []).map(row => row.member_a === userId ? row.member_b : row.member_a);
    const ids = (rows ?? []).map(row => row.id);
    const [{ data: profiles }, { data: messages }] = await Promise.all([
      others.length ? supabase.from("profiles").select("user_id,username").in("user_id", others) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("direct_messages").select("id,conversation_id,sender_id,recipient_id,body,read_at,created_at").in("conversation_id", ids).order("created_at", { ascending:false }).limit(300) : Promise.resolve({ data: [] }),
    ]);
    const names = new Map((profiles ?? []).map(profile => [profile.user_id, profile.username]));
    setConversations((rows ?? []).map(row => { const otherId = row.member_a === userId ? row.member_b : row.member_a; const related = (messages ?? []).filter(message => message.conversation_id === row.id); return { ...row, otherId, otherName:names.get(otherId) ?? "Meet Freely member", unread:related.filter(message => message.recipient_id === userId && !message.read_at).length, preview:related[0]?.body ?? "You accepted an introduction. Say hello when you’re ready." }; }));
  };

  useEffect(() => {
    if (!supabase || !verified || !userId) { setConversations([]); return; }
    void loadConversations();
    const channel = supabase.channel(`messages:${userId}`).on("postgres_changes", { event:"*", schema:"public", table:"direct_messages" }, () => void loadConversations()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [verified, userId, activityVersion]);

  const loadAdminConsole = async () => {
    if (!supabase || !isAdmin) return;
    setAuthBusy(true); setAuthMessage("");
    const [{ data: requests, error: requestError }, { data: reports, error: reportError }] = await Promise.all([
      supabase.from("verification_requests").select("user_id,birth_date,status,submitted_at").order("submitted_at", { ascending:false }),
      supabase.from("reports").select("id,reporter_id,reported_id,reason,status,created_at").order("created_at", { ascending:false }),
    ]);
    const ids = (requests ?? []).map(row => row.user_id);
    const [{ data: profiles }, { data: accounts }] = await Promise.all([
      ids.length ? supabase.from("profiles").select("user_id,username").in("user_id", ids) : Promise.resolve({data:[]}),
      ids.length ? supabase.from("accounts").select("user_id,state").in("user_id", ids) : Promise.resolve({data:[]}),
    ]);
    const names = new Map((profiles ?? []).map(row => [row.user_id,row.username])); const states = new Map((accounts ?? []).map(row => [row.user_id,row.state]));
    setVerificationReviews((requests ?? []).map(row => ({...row, username:names.get(row.user_id) ?? "Member", accountState:states.get(row.user_id) ?? "pending"})));
    setSafetyReports(reports ?? []); setAuthMessage(requestError?.message ?? reportError?.message ?? ""); setAuthBusy(false);
  };
  const openAdminConsole = () => { setModal("admin"); void loadAdminConsole(); };
  const reviewVerification = async (memberId: string, decision: "verified" | "failed") => {
    if (!supabase || !isAdmin || !userId) return;
    setAuthBusy(true);
    const [{ error:a }, { error:b }] = await Promise.all([
      supabase.from("verification_requests").update({status:decision,reviewed_at:new Date().toISOString()}).eq("user_id",memberId),
      supabase.from("accounts").update({verification:decision,state:decision === "verified" ? "active" : "pending"}).eq("user_id",memberId),
    ]);
    setAuthMessage(a?.message ?? b?.message ?? (decision === "verified" ? "Member approved." : "Verification rejected.")); setAuthBusy(false); await loadAdminConsole();
  };
  const setAccountState = async (memberId: string, state: "active" | "paused" | "banned") => {
    if (!supabase || !isAdmin) return;
    const { error } = await supabase.from("accounts").update({state}).eq("user_id",memberId); setAuthMessage(error?.message ?? `Account set to ${state}.`); await loadAdminConsole();
  };
  const reviewReport = async (reportId: string, status: "reviewed" | "actioned" | "dismissed") => {
    if (!supabase || !isAdmin || !userId) return;
    const { error } = await supabase.from("reports").update({status,reviewed_at:new Date().toISOString(),reviewer_id:userId}).eq("id",reportId); setAuthMessage(error?.message ?? `Report marked ${status}.`); await loadAdminConsole();
  };

  const enter = () => setModal("verify");
  const submitAuth = async () => {
    const needsStrongPassword = authMode === "signup" || authMode === "recovery";
    if (!supabase || (authMode !== "recovery" && !email) || (authMode === "signin" && password.length < 8) || (needsStrongPassword && !strongPassword)) return;
    setAuthBusy(true);
    setAuthMessage("");
    if (authMode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo:`${window.location.origin}/` });
      setAuthBusy(false); setAuthMessage(error?.message ?? "Password-reset email sent. Open its link on this device."); return;
    }
    if (authMode === "recovery") {
      const { error } = await supabase.auth.updateUser({password}); setAuthBusy(false);
      if (error) return setAuthMessage(error.message); setAuthMessage("Password updated. You can continue into Meet Freely."); setAuthMode("signin"); return;
    }
    const { data, error } = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) {
      const rateLimited = error.message.toLowerCase().includes("rate") || error.status === 429;
      setAuthMessage(rateLimited ? "Too many account attempts were made recently. Please wait a while and try again. Existing members can still sign in." : error.message);
      return;
    }
    if (authMode === "signup" && !data.session) setAuthMessage("Your account was created, but immediate sign-in is not enabled yet. Please use the email from Meet Freely to continue.");
    else { setSignedIn(true); setModal("onboarding"); }
  };
  const saveProfile = async () => {
    if (!supabase || !adultConfirmed || !username || !birthDate || !broadArea || interests.length === 0) return;
    setAuthBusy(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userError || !userId) {
      await supabase.auth.signOut({ scope: "local" });
      setAuthBusy(false); setSignedIn(false); setUserId(null); setProfileReady(false); setModal("verify"); setAuthMode("signin");
      return setAuthMessage("That saved sign-in belonged to a deleted account and has been cleared. Please sign in again or create a new account.");
    }
    const adultCutoff = new Date(); adultCutoff.setFullYear(adultCutoff.getFullYear() - 18);
    if (new Date(`${birthDate}T12:00:00`) > adultCutoff) { setAuthBusy(false); return setAuthMessage("Meet Freely is only available to adults age 18 and older."); }
    const age = Math.floor((Date.now() - new Date(`${birthDate}T12:00:00`).getTime()) / 31557600000);
    const { error } = await supabase.rpc("complete_onboarding", {
      p_username: username,
      p_age: age,
      p_broad_area: broadArea,
      p_interests: interests,
      p_birth_date: birthDate,
      p_gender: gender || null,
      p_interested_in: interestedIn,
      p_preferred_min_age: preferredMinAge,
      p_preferred_max_age: preferredMaxAge,
      p_compatibility_mode: compatibilityMode,
    });
    setAuthBusy(false);
    if (error) return setAuthMessage(friendlyError(error, "Your profile could not be submitted."));
    setMyAge(age); setDiscoverable(true); setProfileReady(true); setVerificationStatus("pending"); setAuthMessage("Profile submitted. An adult review is next; you’ll be able to start membership immediately after approval.");
  };
  const startMembership = async () => {
    if (!supabase || !adultVerified) return;
    setAuthBusy(true); setAuthMessage("");
    const { data, error } = await supabase.functions.invoke("create-checkout-session");
    setAuthBusy(false);
    if (error || !data?.url) return setAuthMessage(friendlyError(data?.error ?? error, "Checkout could not be opened. Please try again."));
    window.location.assign(data.url);
  };
  const manageBilling = async () => {
    if (!supabase || !hasBillingAccount) return;
    setAuthBusy(true); setAuthMessage("");
    const { data, error } = await supabase.functions.invoke("create-billing-portal");
    setAuthBusy(false);
    if (error || !data?.url) return setAuthMessage(friendlyError(data?.error ?? error, "Billing could not be opened. Please try again."));
    window.location.assign(data.url);
  };
  const signOut = async () => { await supabase?.auth.signOut(); setSignedIn(false); setVerified(false); setAdultVerified(false); setProfileReady(false); setModal(null); };
  const pauseAccount = async () => {
    if (!supabase || !userId) return; setAuthBusy(true);
    const [{error:a}] = await Promise.all([supabase.from("profiles").update({discoverable:false}).eq("user_id",userId), supabase.from("room_members").update({state:"left"}).eq("user_id",userId)]);
    setDiscoverable(false); setAuthBusy(false); setAuthMessage(a?.message ?? "Your bubble is hidden. Sign back in and enable room visibility whenever you’re ready.");
  };
  const deleteAccount = async () => {
    if (!supabase || deleteConfirmation !== "DELETE") return; setAuthBusy(true); setAuthMessage("");
    const { error } = await supabase.functions.invoke("delete-account", {body:{confirmation:"DELETE"}});
    if (error) { setAuthBusy(false); return setAuthMessage(error.message); }
    window.localStorage.removeItem("meet-freely-pins"); await supabase.auth.signOut(); setAuthBusy(false); setSignedIn(false); setVerified(false); setProfileReady(false); setModal(null);
  };
  const updateProfile = async () => {
    if (!supabase || username.length < 3 || !broadArea || interests.length === 0) return;
    setAuthBusy(true); setAuthMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) { setAuthBusy(false); return setAuthMessage("Please sign in again."); }
    const { error } = await supabase.from("profiles").update({ username, broad_area: broadArea, bio: bio.trim() || null, intentions: intention ? [intention] : [], interests, gender:gender || null, interested_in:interestedIn, preferred_min_age:preferredMinAge, preferred_max_age:preferredMaxAge, compatibility_mode:compatibilityMode, discoverable }).eq("user_id", userId);
    setAuthBusy(false);
    setAuthMessage(error ? error.message : "Profile saved. Your bubble is up to date.");
  };
  const postInvitation = async () => {
    if (!supabase || inviteText.trim().length < 5) return;
    setAuthBusy(true); setAuthMessage("");
    const [{ data: sessionData }, { data: room, error: roomError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("rooms").select("id").eq("name", inviteRoom).single(),
    ]);
    const userId = sessionData.session?.user.id;
    const { error } = userId && room ? await supabase.from("open_invitations").insert({ author_id: userId, room_id: room.id, body: inviteText.trim(), broad_area: broadArea || null }) : { error: roomError ?? new Error("Please sign in again.") };
    setAuthBusy(false);
    if (error) return setAuthMessage(error.message);
    setInviteText(""); setAuthMessage("Your invitation is live for 24 hours."); setActivityVersion(value => value + 1);
  };
  const hideDraggedPerson = async () => {
    if (!draggingPerson) return;
    const person = visiblePeople.find(item => item.name === draggingPerson);
    if (supabase && userId && person?.id) { const {error} = await supabase.from("blocks").upsert({ blocker_id:userId, blocked_id:person.id }); if (error) { setDraggingPerson(null); return setAuthMessage(friendlyError(error, "That member could not be blocked.")); } }
    setHiddenPeople(current => [...current, draggingPerson]);
    setDraggingPerson(null);
  };
  const hello = (person: RoomPerson) => { setSelected(person); setSent(false); setIntroductionText(`Your note about ${(person.tags[1] || person.tags[0] || "this room").toLowerCase()} caught my attention—what got you into it?`); setModal("hello"); };
  const sendIntroduction = async () => {
    if (!selected || introductionText.trim().length < 1) return;
    if (!supabase || !userId || !selected.id) { setSent(true); return; }
    setAuthBusy(true); setAuthMessage("");
    const { error } = await supabase.from("introductions").insert({ sender_id: userId, recipient_id: selected.id, message: introductionText.trim() });
    setAuthBusy(false);
    if (error) return setAuthMessage(error.message);
    setSent(true); setActivityVersion(value => value + 1);
  };
  const respondToIntroduction = async (id: string, state: "accepted" | "passed" | "reported") => {
    if (!supabase) return;
    setAuthBusy(true); setAuthMessage("");
    const item = introductions.find(introduction => introduction.id === id);
    const { error } = await supabase.from("introductions").update({ state, updated_at:new Date().toISOString() }).eq("id", id);
    if (!error && state === "reported" && item?.incoming && userId) await supabase.from("reports").insert({ reporter_id:userId, reported_id:item.sender_id, reason:"Reported an introduction from the member inbox." });
    setAuthBusy(false);
    if (error) return setAuthMessage(error.message);
    setIntroductions(current => current.map(item => item.id === id ? { ...item, state } : item));
    setActivityVersion(value => value + 1);
  };
  const openConversation = async (conversation: ConversationItem) => {
    if (!supabase || !userId) return;
    setSelectedConversation(conversation); setMessageText(""); setModal("chat");
    const { data } = await supabase.from("direct_messages").select("id,conversation_id,sender_id,recipient_id,body,read_at,created_at").eq("conversation_id", conversation.id).order("created_at");
    setDirectMessages(data ?? []);
    await supabase.from("direct_messages").update({ read_at:new Date().toISOString() }).eq("conversation_id", conversation.id).eq("recipient_id", userId).is("read_at", null);
    void loadConversations();
  };
  const sendDirectMessage = async () => {
    if (!supabase || !userId || !selectedConversation || !messageText.trim()) return;
    setAuthBusy(true); setAuthMessage("");
    const { error } = await supabase.from("direct_messages").insert({ conversation_id:selectedConversation.id, sender_id:userId, recipient_id:selectedConversation.otherId, body:messageText.trim() });
    setAuthBusy(false);
    if (error) return setAuthMessage(error.message);
    setMessageText(""); await openConversation(selectedConversation);
  };
  const undoLastHide = async () => {
    const name = hiddenPeople.at(-1); if (!name) return;
    const person = roomPeople.find(item => item.name === name);
    if (supabase && userId && person?.id) { const {error} = await supabase.from("blocks").delete().eq("blocker_id",userId).eq("blocked_id",person.id); if (error) return setAuthMessage(friendlyError(error, "That block could not be undone.")); }
    setHiddenPeople(current => current.slice(0,-1));
  };
  const blockSelectedMember = async () => {
    if (!supabase || !userId || !selected?.id) return;
    setAuthBusy(true); const {error} = await supabase.from("blocks").upsert({blocker_id:userId,blocked_id:selected.id}); setAuthBusy(false);
    if (error) return setAuthMessage(friendlyError(error, "That member could not be blocked."));
    setHiddenPeople(current => current.includes(selected.name) ? current : [...current,selected.name]); setModal(null); setAuthMessage("Member blocked and removed from your view.");
  };
  const sendRoomMessage = async () => {
    const body = roomMessageText.trim();
    if (!supabase || !userId || !activeRoomId || body.length < 1) return;
    setAuthBusy(true); setAuthMessage("");
    const { error } = await supabase.from("room_messages").insert({ room_id: activeRoomId, sender_id: userId, body });
    setAuthBusy(false);
    if (error) return setAuthMessage(friendlyError(error, "Your room message could not be sent."));
    setRoomMessageText("");
  };
  const blockChatMember = async () => {
    if (!supabase || !userId || !selectedConversation) return;
    await supabase.from("blocks").upsert({ blocker_id:userId, blocked_id:selectedConversation.otherId });
    setConversations(current => current.filter(item => item.id !== selectedConversation.id)); setModal("messages");
  };
  const openReport = (id: string, name: string) => { setReportTarget({id,name}); setReportReason("Harassment or unwanted contact"); setReportDetails(""); setAuthMessage(""); setModal("report"); };
  const submitSafetyReport = async () => {
    if (!supabase || !userId || !reportTarget) return;
    setAuthBusy(true); setAuthMessage("");
    const detail = reportDetails.trim() ? ` — ${reportDetails.trim()}` : "";
    const { error } = await supabase.from("reports").insert({ reporter_id:userId, reported_id:reportTarget.id, reason:`${reportReason}${detail}` });
    setAuthBusy(false);
    if (error) return setAuthMessage(friendlyError(error, "Your report could not be submitted."));
    setAuthMessage("Report received. The member is not notified, and the safety queue can now review it.");
    setReportDetails("");
  };
  const installApp = async () => {
    if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); return; }
    setInstallHelpOpen(true);
  };
  const useNearbyLocation = () => {
    if (!supabase || !userId || !navigator.geolocation) return setAuthMessage("Approximate location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(async position => {
      const cellLat = Math.floor((position.coords.latitude + 90) * 4);
      const cellLon = Math.floor((position.coords.longitude + 180) * 4);
      const { error: locationError } = await supabase.from("profile_location_cells").upsert({ user_id: userId, cell_lat: cellLat, cell_lon: cellLon, updated_at: new Date().toISOString() });
      if (locationError) { setLocationReady(false); return setAuthMessage(friendlyError(locationError, "Nearby preference could not be saved.")); }
      const { data, error } = await supabase.rpc("nearby_member_ids", { p_cell_lat: cellLat, p_cell_lon: cellLon });
      if (error) { setLocationReady(false); return setAuthMessage(friendlyError(error, "Nearby preference could not be applied.")); }
      setNearbyOrder((data ?? []).map((row: { user_id: string }) => row.user_id));
      setLocationReady(true);
      setAuthMessage("Nearby preference is on. Meet Freely stored only a broad map cell—not your coordinates.");
    }, () => { setLocationReady(false); setAuthMessage("Location access was not enabled. Your broad-area setting is still in use."); }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 });
  };
  const beginRoomSwipe = (event: React.PointerEvent) => { swipeMoved.current = false; swipeStart.current = { x: event.clientX - roomOffset.x, y: event.clientY - roomOffset.y }; event.currentTarget.setPointerCapture(event.pointerId); };
  const moveRoom = (event: React.PointerEvent) => { if (!swipeStart.current) return; const x = event.clientX - swipeStart.current.x; const y = event.clientY - swipeStart.current.y; if (Math.abs(x - roomOffset.x) > 7 || Math.abs(y - roomOffset.y) > 7) { swipeMoved.current = true; setSwipeHintVisible(false); } setRoomOffset({ x: Math.max(-190, Math.min(190, x)), y: Math.max(-230, Math.min(230, y)) }); };
  const endRoomSwipe = () => { swipeStart.current = null; window.setTimeout(() => { swipeMoved.current = false; }, 0); };
  const uploadPhoto = async (file?: File) => {
    if (!supabase || !file || photos.length >= 5) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return setAuthMessage("Choose a JPG, PNG, or WebP image under 10 MB.");
    setPhotoBusy(true); setAuthMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession(); const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Please sign in again.");
      const prepared = await prepareProfilePhoto(file); const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, prepared, { contentType: "image/jpeg", cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from("profile_photos").insert({ user_id: userId, storage_path: path, position: photos.length, is_primary: photos.length === 0 });
      if (rowError) { await supabase.storage.from("profile-photos").remove([path]); throw rowError; }
      await loadPhotos(userId); setAuthMessage("Photo added. Location metadata was removed for privacy.");
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Photo upload failed."); }
    setPhotoBusy(false);
  };
  const makePrimaryPhoto = async (photoId: string) => {
    if (!supabase) return; setPhotoBusy(true); setAuthMessage("");
    const { data: sessionData } = await supabase.auth.getSession(); const userId = sessionData.session?.user.id;
    if (!userId) { setPhotoBusy(false); return; }
    const { error: clearError } = await supabase.from("profile_photos").update({ is_primary: false }).eq("user_id", userId);
    const { error } = clearError ? { error: clearError } : await supabase.from("profile_photos").update({ is_primary: true }).eq("id", photoId).eq("user_id", userId);
    if (!error) await loadPhotos(userId); setAuthMessage(error?.message ?? "Primary bubble photo updated."); setPhotoBusy(false);
  };
  const removePhoto = async (photo: ProfilePhoto) => {
    if (!supabase) return; setPhotoBusy(true); setAuthMessage("");
    const { data: sessionData } = await supabase.auth.getSession(); const userId = sessionData.session?.user.id;
    if (!userId) { setPhotoBusy(false); return; }
    const { error } = await supabase.storage.from("profile-photos").remove([photo.storage_path]);
    if (!error) await supabase.from("profile_photos").delete().eq("id", photo.id).eq("user_id", userId);
    const remaining = photos.filter(item => item.id !== photo.id); if (!error && photo.is_primary && remaining[0]) await supabase.from("profile_photos").update({ is_primary: true }).eq("id", remaining[0].id).eq("user_id", userId);
    if (!error) await loadPhotos(userId); setAuthMessage(error?.message ?? "Photo removed."); setPhotoBusy(false);
  };
  const primaryPhoto = photos.find(photo => photo.is_primary) ?? photos[0];
  const roomCandidates = verified ? [...roomPeople].sort((a,b) => {
    if (!locationReady) return 0;
    const aRank = a.id ? nearbyOrder.indexOf(a.id) : -1;
    const bRank = b.id ? nearbyOrder.indexOf(b.id) : -1;
    return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank);
  }) : people;
  const visiblePeople = roomCandidates.filter(person => {
    if (compatibilityMode === "strict" && !person.sample) {
      if (person.age !== null && (person.age < preferredMinAge || person.age > preferredMaxAge)) return false;
      if (interestedIn.length && person.gender && !interestedIn.includes(person.gender)) return false;
      if (person.interestedIn?.length && gender && !person.interestedIn.includes(gender)) return false;
      if (myAge !== null && (myAge < (person.preferredMinAge ?? 18) || myAge > (person.preferredMaxAge ?? 99))) return false;
    }
    if (person.age !== null && (person.age < filterMinAge || person.age > filterMaxAge)) return false;
    if (filterOnlineOnly && !person.online) return false;
    if (filterIntention && !person.tags.some(tag => tag.toLowerCase().includes(filterIntention.toLowerCase()))) return false;
    if (filterGender && person.gender !== filterGender) return false;
    if (filterArea && !person.area.toLowerCase().includes(filterArea.toLowerCase())) return false;
    return true;
  });
  const activeFilterCount = Number(filterMinAge > 18 || filterMaxAge < 99) + Number(Boolean(filterIntention)) + Number(Boolean(filterGender)) + Number(Boolean(filterArea)) + Number(filterOnlineOnly);
  const visibleRoomCount = roomMemberCount;
  const unreadConversationCount = conversations.reduce((total, conversation) => total + conversation.unread, 0);
  const openMyProfile = () => { setAuthMessage(""); setModal("profile"); };

  if (!browserReady) {
    return <main className="app-loading" aria-busy="true"><div className="loading-bubble"><img className="loading-brand-icon" src="/app-icon.png" alt="" /><strong>meet freely</strong><small>Opening the room…</small></div></main>;
  }

  return (
    <main className={signedIn && verified ? "member-session" : "visitor-session"}>
      {signedIn && verified && <section className="mobile-app" aria-label="Meet Freely member room">
        {isAdmin && <button className="admin-console-launch" onClick={openAdminConsole}>Owner console</button>}
        <header className="mobile-app-bar"><button className="app-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open app menu">☰</button><div><small>{activeRoom.toUpperCase()} · {locationReady ? "NEARBY PREFERENCE ON" : broadArea.toUpperCase()}</small><strong>{roomLoading ? "Opening room…" : `${visibleRoomCount} member${visibleRoomCount === 1 ? "" : "s"} here recently`}</strong></div><button className="my-mini-bubble" onClick={openMyProfile} aria-label="Edit my profile">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your profile" /> : username.slice(0, 2).toUpperCase() || "ME"}</button></header>
        <div className="mobile-room" onPointerDown={beginRoomSwipe} onPointerMove={moveRoom} onPointerUp={endRoomSwipe} onPointerCancel={endRoomSwipe}>
          <div className="mobile-bubble-field" style={{ transform: `translate(${roomOffset.x}px, ${roomOffset.y}px)` }}>
          <button className="mobile-own-bubble" onClick={openMyProfile}><span className="bubble-photo">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your primary profile" /> : username.slice(0, 2).toUpperCase() || "ME"}</span><strong>{username || "Your bubble"}</strong><small>You · tap to edit</small><span className="presence"><i />Here now</span></button>
          {visiblePeople.filter(person => !hiddenPeople.includes(person.name)).map((person, index) => <div role="button" tabIndex={0} key={person.id ?? person.name} className={`mobile-member-bubble mobile-bubble-${index + 1} ${person.tone} ${person.online ? "is-online" : "is-offline"} ${pinnedPeople.includes(person.name) ? "is-pinned" : ""}`} onClick={() => { if (!swipeMoved.current) hello(person); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") hello(person); }}><button className="bubble-pin" onClick={(event) => { event.stopPropagation(); setPinnedPeople(current => current.includes(person.name) ? current.filter(name => name !== person.name) : [...current, person.name]); }} aria-label={pinnedPeople.includes(person.name) ? `Unpin ${person.name}` : `Pin ${person.name}`}>{pinnedPeople.includes(person.name) ? "●" : "⌖"}</button><span className={`bubble-photo ${person.sample ? "sample-photo" : ""}`} style={person.photoUrl ? undefined : {backgroundPosition:person.photoPosition}}>{person.photoUrl ? <img src={person.photoUrl} alt={`${person.name} profile`} /> : person.sample ? "" : person.initials}</span><strong>{person.name}</strong><small>{person.age ? `${person.age} · ` : ""}{person.area}</small><span className="presence"><i />{person.online ? "Here now" : "Away"}</span></div>)}
          </div>{verified && roomPeople.length === 0 && !roomLoading ? <div className="room-filter-empty honest-empty"><strong>You’re first in this room right now</strong><small>Try another interest room or post an open invitation. Real member rooms are never filled with fake profiles.</small></div> : visiblePeople.length === 0 && <button className="room-filter-empty" onClick={() => setModal("filters")}><strong>No bubbles fit your filters</strong><small>Adjust your room filters</small></button>}{swipeHintVisible && roomPeople.length > 0 && <span className="swipe-hint">Swipe the room to explore farther</span>}
          <button className="mobile-invite-action" onClick={() => { setAuthMessage(""); setModal("invite"); }}>＋ <span>Post an invitation</span></button>
          <button className="mobile-filter-action" onClick={() => setModal("filters")}>☷ Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
        </div>
        {mobileMenuOpen && <><button className="drawer-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" /><aside className="app-drawer" aria-label="App menu"><div className="drawer-head"><span className="brand"><i className="brand-dot">●</i> meet freely</span><button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">×</button></div><button className="nearby-control" onClick={useNearbyLocation}><span>◎</span><div><strong>{locationReady ? "Nearby preference is on" : "Prefer people in my area"}</strong><small>{locationReady ? "Exact coordinates are not displayed or saved" : `Or keep using ${broadArea}`}</small></div></button><p className="drawer-label">ROOMS</p>{rooms.map(room => <button className={`drawer-room ${activeRoom === room.name ? "is-active" : ""}`} aria-current={activeRoom === room.name ? "page" : undefined} key={room.name} onClick={() => { setActiveRoom(room.name); setRoomOffset({x:0,y:0}); setSwipeHintVisible(true); setMobileMenuOpen(false); }}><span style={{background:room.color}}>{room.icon}</span><strong>{room.name}</strong><small>{roomCounts[room.name] ?? 0} here recently</small></button>)}<div className="drawer-links"><button onClick={() => { setMobileMenuOpen(false); setModal("roomchat"); }}>Room conversation</button><button onClick={() => { setMobileMenuOpen(false); setModal("invite"); }}>Open invitations</button><button onClick={() => { setMobileMenuOpen(false); setModal("messages"); }}>Messages {unreadConversationCount > 0 && <span className="menu-badge">{unreadConversationCount}</span>}</button><button onClick={() => { setMobileMenuOpen(false); openMyProfile(); }}>My profile</button><button onClick={installApp}>Add Meet Freely to Home Screen</button><a href="#safety" onClick={() => setMobileMenuOpen(false)}>Safety & privacy</a><button onClick={signOut}>Sign out</button></div></aside></>}
        {installHelpOpen && <div className="install-lightbox" role="dialog" aria-modal="true"><button className="close" onClick={() => setInstallHelpOpen(false)} aria-label="Close">×</button><div className="install-icon">●</div><p className="eyebrow">KEEP THE ROOM CLOSE</p><h2>Add Meet Freely to your Home Screen</h2><p><strong>On iPhone:</strong> tap the Share button in Safari, then choose <em>Add to Home Screen</em>.</p><p><strong>On Android:</strong> open the browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</p><button className="primary full" onClick={() => setInstallHelpOpen(false)}>Got it</button></div>}
      </section>}
      <nav className="nav">
        <a className="brand" href="#top" aria-label="Meet Freely home"><span className="brand-dot">●</span> meet freely</a>
        <div className="nav-links"><a href="#how">How it works</a><a href="#safety">Safety</a><button className="text-button" onClick={() => signedIn ? setModal(profileReady ? "profile" : "onboarding") : enter()}>{profileReady ? "My profile" : signedIn ? "Finish profile" : "Sign in"}</button></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Interest rooms for verified adults</p>
          <h1>Dating should feel like <em>walking into a room.</em></h1>
          <p className="lede">Look around. Notice someone. Say hello. No swiping, hidden likes, boosts, or algorithm deciding who gets seen.</p>
          <div className="hero-actions">
            <button className="primary" onClick={verified ? () => document.getElementById("room")?.scrollIntoView({ behavior: "smooth" }) : signedIn ? () => setModal("onboarding") : enter}>{verified ? "Enter the room" : signedIn ? "Continue account setup" : "Create a private account"}<span>→</span></button>
            <span className="price">$2.99/month<br/><small>One simple membership</small></span>
          </div>
          <p className="privacy-note">Visitor Preview protects member identities. Real profiles are only visible to verified adults.</p>
        </div>

        <div className="room-window" aria-label={verified ? "Member room preview" : "Protected visitor preview"}>
          <div className="window-top"><span>EXAMPLE ROOM PREVIEW</span><span className="active"><i /> Illustration</span></div>
          <div className="preview-bubbles revealed">
            {people.slice(0, 4).map((person, index) => <div className={`member-bubble preview-bubble bubble-${index + 1} ${person.tone}`} key={person.name}><div className="bubble-photo sample-photo" style={{backgroundPosition:person.photoPosition}} /><strong>{person.name}</strong><small>Example profile</small></div>)}
          </div>
          {!verified && <div className="privacy-shield"><div className="lock">⌁</div><strong>People, not a public catalog.</strong><span>Verify to see who’s inside.</span><button onClick={enter}>Enter securely</button></div>}
        </div>
      </section>

      <section className="promise-strip"><span>No swipe queue</span><span>No paid boosts</span><span>No hidden likes</span><span>No precise locations</span></section>

      <section className="invites-section" id="invites">
        <div className="section-heading"><div><p className="eyebrow">OPEN INVITATIONS</p><h2>See who wants to do something.</h2></div><p className="section-note">Short, timely posts from people who are online now. They disappear automatically, so the list always feels alive.</p></div>
        <div className="invite-layout">
          <div className="invite-feed">
            {verified && invitations.length ? invitations.slice(0,4).map(invitation => <article className="invite-card" key={invitation.id}><div className={`invite-avatar ${invitation.author.tone}`}>{invitation.author.initials}<i /></div><div><div className="invite-meta"><strong>{invitation.author.name}{invitation.author.id === userId ? " · You" : ""}</strong><span>{new Date(invitation.created_at).toLocaleDateString([], { month:"short", day:"numeric" })}</span></div><p>{invitation.body}</p><small>{invitation.roomName} · {invitation.broad_area || invitation.author.area}</small></div><button onClick={() => invitation.author.id === userId ? openMyProfile() : hello(invitation.author)}>{invitation.author.id === userId ? "Profile" : "Message"} <span>→</span></button></article>) : <article className="invite-card"><div className="invite-avatar rose">MF<i /></div><div><div className="invite-meta"><strong>{verified ? "The room is open" : "Verified member"}</strong><span>Now</span></div><p>{verified ? "No live invitations yet. Be the first to suggest something." : "Verify your account to read open invitations."}</p><small>Precise locations are never shown</small></div><button onClick={verified ? () => setModal("invite") : enter}>{verified ? "Post" : "Join"} <span>→</span></button></article>}
            <button className="post-invite" onClick={verified ? () => { setAuthMessage(""); setModal("invite"); } : enter}><span>＋</span><div><strong>Post an open invitation</strong><small>Tell the room what you feel like doing.</small></div></button>
          </div>
          <aside className="interest-rooms"><p className="eyebrow">BROWSE ROOMS</p>{rooms.map(room => <button className={activeRoom === room.name ? "selected-room" : ""} aria-current={activeRoom === room.name ? "page" : undefined} key={room.name} onClick={() => { setActiveRoom(room.name); setRoomOffset({x:0,y:0}); document.getElementById("room")?.scrollIntoView({behavior:"smooth"}); }}><span className={`room-icon ${room.name === "Live music" ? "plum" : room.name === "Food & coffee" ? "gold" : room.name === "Outdoors" ? "mint" : "coral"}`}>{room.icon}</span><div><strong>{room.name}</strong><small>{verified ? `${roomCounts[room.name] ?? 0} here recently` : "Sign in to see live activity"}</small></div><b>{activeRoom === room.name ? "✓" : "→"}</b></button>)}</aside>
        </div>
      </section>

      <section className="room-section" id="room">
        <div className="section-heading"><div><p className="eyebrow"><span className="live-dot" /> {activeRoom.toUpperCase()} ROOM</p><h2>Everyone here shares an interest.</h2><p className="desktop-room-count">{roomLoading ? "Opening the live room…" : `${visiblePeople.length} shown · ${visibleRoomCount} here recently · broad areas only`}</p></div><div className="filters"><button className={activeFilterCount ? "active-filter" : ""} onClick={() => setModal("filters")}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button><button onClick={() => document.getElementById("invites")?.scrollIntoView({behavior:"smooth"})}>Open invitations</button><button onClick={() => setModal("messages")}>Messages</button></div></div>
        <div className={`bubble-room ${!verified ? "visitor-room" : ""}`}>
          {visiblePeople.filter(person => !hiddenPeople.includes(person.name)).map((person, index) => (
            <div role="button" tabIndex={0} draggable className={`member-bubble room-bubble bubble-${index + 1} ${person.tone} ${person.online ? "is-online" : "is-offline"} ${pinnedPeople.includes(person.name) ? "is-pinned" : ""}`} key={person.id ?? person.name} onDragStart={() => setDraggingPerson(person.name)} onDragEnd={() => setDraggingPerson(null)} onClick={() => verified ? hello(person) : enter()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { if (verified) hello(person); else enter(); } }} aria-label={verified ? `Open ${person.name} profile` : "Verify to meet people in this room"}>
              {verified && <button className="desktop-bubble-pin" onClick={(event) => { event.stopPropagation(); setPinnedPeople(current => current.includes(person.name) ? current.filter(name => name !== person.name) : [...current, person.name]); }} aria-label={pinnedPeople.includes(person.name) ? `Unpin ${person.name}` : `Pin ${person.name}`}>{pinnedPeople.includes(person.name) ? "●" : "⌖"}</button>}
              <span className="bubble-shine" />
              <span className={`bubble-photo ${verified && person.sample ? "sample-photo" : ""}`} style={verified && !person.photoUrl ? {backgroundPosition:person.photoPosition} : undefined}>{verified ? person.photoUrl ? <img src={person.photoUrl} alt={`${person.name} profile`} /> : person.sample ? "" : person.initials : "•"}</span>
              <strong>{verified ? person.name : "Verified person"}</strong>
              <small>{verified ? `${person.age} · ${person.area}` : "Identity protected"}</small>
              <span className="presence"><i />{person.online ? "Here now" : "Away"}</span>
            </div>
          ))}
          {verified ? <button className="desktop-own-bubble" onClick={openMyProfile}><span className="bubble-photo">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your primary profile" /> : username.slice(0,2).toUpperCase() || "ME"}</span><strong>{username || "Your bubble"}</strong><small>You · tap to edit</small><span className="presence"><i />Here now</span></button> : <div className="room-center"><span>{activeRoom.toUpperCase()}</span><strong>{visibleRoomCount} nearby</strong><small>Verify to see and meet everyone in this room.</small></div>}
          {verified && roomPeople.length === 0 && !roomLoading && <div className="desktop-honest-empty"><strong>You’re first here right now.</strong><small>No sample members are shown inside real member rooms.</small></div>}
          <div className={`block-dock ${draggingPerson ? "is-ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={hideDraggedPerson}><span>×</span><strong>Hide & block</strong><small>Drag someone here for mutual invisibility</small></div>
          {hiddenPeople.length > 0 && <button className="undo-hide" onClick={undoLastHide}>Undo last hide</button>}
        </div>
        {verified && <section className="room-chat" aria-label={`${activeRoom} room conversation`}><div className="room-chat-head"><div><p className="eyebrow">ROOM CONVERSATION</p><h3>Talk with everyone here.</h3></div><small>Visible only to verified members</small></div><div className="room-chat-thread" aria-live="polite">{roomMessages.length ? roomMessages.map(message => <article className={message.sender_id === userId ? "mine" : ""} key={message.id}><div><strong>{message.senderName}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time></div><p>{message.body}</p></article>) : <div className="room-chat-empty"><strong>The conversation is open.</strong><p>Say something about {activeRoom.toLowerCase()} to welcome the next person in.</p></div>}</div><div className="room-chat-compose"><textarea value={roomMessageText} onChange={event => setRoomMessageText(event.target.value.slice(0,500))} placeholder={`Say something to the ${activeRoom} room…`} aria-label="Room message"/><button className="primary" onClick={sendRoomMessage} disabled={!roomMessageText.trim() || authBusy}>Send <span>→</span></button></div><small className="character-note">{roomMessageText.length}/500 · Be welcoming. Reports go directly to the safety queue.</small>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}</section>}
      </section>

      <section className="how" id="how">
        <div className="how-intro"><p className="eyebrow">HOW IT WORKS</p><h2>No matching machinery.<br/>Just a better room.</h2><p>Meet Freely gives adults the freedom to discover and approach each other—while keeping member profiles private from unverified visitors.</p></div>
        <div className="steps">
          <article><b>01</b><h3>Verify once</h3><p>An adult-verification review keeps the room human. Your birth date and verification details are never shown to members.</p></article>
          <article><b>02</b><h3>Look around</h3><p>Browse the whole room using filters you control. Choose chronological discovery whenever you want.</p></article>
          <article><b>03</b><h3>Say hello</h3><p>Send a thoughtful introduction directly. No mutual swipe or payment to reveal interest.</p></article>
        </div>
      </section>

      <section className="safety" id="safety">
        <div><p className="eyebrow light">PRIVACY BY DESIGN</p><h2>Open inside.<br/>Opaque outside.</h2></div>
        <div className="safety-list">
          <p><span>01</span><strong>Usernames, never surnames</strong><small>Profiles actively prevent identifying details.</small></p>
          <p><span>02</span><strong>Broad areas, never exact distance</strong><small>No pins, trails, or “0.4 miles away.”</small></p>
          <p><span>03</span><strong>Visitors see activity, not people</strong><small>Real photos and profiles require verification.</small></p>
          <p><span>04</span><strong>Mutual invisibility after blocking</strong><small>A block removes both people from view.</small></p>
        </div>
      </section>

      <section className="pricing">
        <div><p className="eyebrow">ONE FAIR PRICE</p><h2>We charge for the room.<br/>Never for someone’s affection.</h2></div>
        <div className="price-card"><span>Verified membership</span><strong><sup>$</sup>2.99<small>/month</small></strong><ul><li>See everyone in your rooms</li><li>Join room conversations</li><li>Send and receive introductions</li><li>No ads, boosts, or visibility tiers</li></ul><button className="primary dark" onClick={enter}>Join the room <span>→</span></button><small>Cancel anytime. No surprise upgrades.</small></div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-dot">●</span> meet freely</a><p>Meet freely. No match required.</p><div><a href="/safety">Safety Center</a><a href="/community-guidelines">Community Guidelines</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></footer>

      {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><div className="modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close" onClick={() => setModal(null)} aria-label="Close">×</button>
        {modal === "verify" ? <>
          <div className="modal-mark">✓</div><p className="eyebrow">PRIVATE ACCOUNT</p><h2>{authMode === "signin" ? "Welcome back." : authMode === "signup" ? "Join the room." : authMode === "forgot" ? "Reset your password." : "Choose a new password."}</h2><p>{authMode === "forgot" ? "We’ll email you a private reset link." : authMode === "recovery" ? "Choose a strong new password." : "Use your email and password. Your email and legal identity are never shown on your dating profile."}</p>
          {authMode !== "recovery" && <div className="auth-tabs"><button className={authMode === "signin" ? "active" : ""} onClick={() => { setAuthMode("signin"); setAuthMessage(""); }}>Sign in</button><button className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}>Create account</button></div>}
          {authMode !== "recovery" && <input className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-label="Email address" />}
          {authMode !== "forgot" && <><input className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={authMode === "signin" ? "Your password" : "12+ characters with upper, lower, number & symbol"} aria-label="Password" />{(authMode === "signup" || authMode === "recovery") && <small className="modal-foot">Use at least 12 characters with uppercase, lowercase, a number, and a symbol.</small>}</>}
          <button className="primary full" onClick={submitAuth} disabled={(authMode !== "recovery" && !email) || (authMode === "signin" && password.length < 8) || ((authMode === "signup" || authMode === "recovery") && !strongPassword) || authBusy || !isSupabaseConfigured}>{authBusy ? "Working…" : authMode === "signin" ? "Sign in" : authMode === "signup" ? "Create my private account" : authMode === "forgot" ? "Email my reset link" : "Save new password"} <span>→</span></button>
          {authMode === "signin" && <button className="signout-button" onClick={() => {setAuthMode("forgot");setAuthMessage("");}}>Forgot password?</button>}{(authMode === "forgot" || authMode === "recovery") && <button className="signout-button" onClick={() => {setAuthMode("signin");setAuthMessage("");}}>Back to sign in</button>}
          {authMode === "signup" && <small className="modal-foot">By creating an account, you agree to the <a href="/terms">Terms</a>, <a href="/privacy">Privacy Policy</a>, and <a href="/community-guidelines">Community Guidelines</a>.</small>}{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<small className="modal-foot">Your email stays private and is used for account recovery and essential notices. Room access requires adult approval and active membership.</small>
        </> : modal === "onboarding" ? <>
          <div className="modal-mark">✓</div><p className="eyebrow">{profileReady ? "ACCOUNT STATUS" : "PRIVATE PROFILE"}</p><h2>{profileReady ? "Your place is saved." : "Make your bubble yours."}</h2>
          {profileReady ? <><div className="account-progress"><span className="done">✓ Private account created</span><span className="done">✓ Private profile created</span><span className={verificationStatus === "verified" ? "done" : "current"}>{verificationStatus === "verified" ? "✓" : "3"} Adult verification {verificationStatus}</span><span className={verified ? "done" : adultVerified ? "current" : ""}>{verified ? "✓" : "4"} Membership {membershipStatus}</span></div><p>Your profile remains invisible until adult verification and membership are active. Unverified visitors cannot view it while you wait.</p>{adultVerified && !verified && <button className="primary full" onClick={startMembership} disabled={authBusy}>{authBusy ? "Opening secure checkout…" : "Start membership · $2.99/month"} <span>→</span></button>}{hasBillingAccount && <button className="signout-button" onClick={manageBilling} disabled={authBusy}>Manage billing or cancel</button>}{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="signout-button" onClick={() => setModal(null)}>Return to Meet Freely</button><button className="signout-button" onClick={signOut}>Sign out</button></> : <><p>Use a username—not your surname or social handle. Only your broad area is shown.</p><input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24))} placeholder="Private username" aria-label="Private username" /><input className="auth-input" value={broadArea} onChange={(event) => setBroadArea(event.target.value.slice(0, 80))} placeholder="Broad area, e.g. West side" aria-label="Broad area" /><label className="field-label">Date of birth<input className="auth-input" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label><div className="interest-picker">{["Food & coffee","Live music","Outdoors","Books & art","Things to do tonight"].map(item => <button type="button" className={interests.includes(item) ? "selected" : ""} key={item} onClick={() => setInterests(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{item}</button>)}</div><label className="adult-check"><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /> I confirm this birth date is mine and I am at least 18 years old.</label><button className="primary full" onClick={saveProfile} disabled={!adultConfirmed || username.length < 3 || !broadArea || !birthDate || interests.length === 0 || authBusy}>{authBusy ? "Saving…" : "Submit for verification"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<small className="modal-foot">Your birth date is private and is never placed on your dating profile.</small></>}
        </> : modal === "filters" ? <>
          <div className="modal-mark">☷</div><p className="eyebrow">ROOM FILTERS</p><h2>Who would you like to meet?</h2><p>These choices only narrow your view. They never change your visibility or reveal anyone’s precise location.</p>
          <div className="age-filter"><label className="field-label">Minimum age<input className="auth-input" type="number" min="18" max="99" value={filterMinAge} onChange={(event) => setFilterMinAge(Math.max(18,Math.min(filterMaxAge,Number(event.target.value) || 18)))} /></label><label className="field-label">Maximum age<input className="auth-input" type="number" min="18" max="99" value={filterMaxAge} onChange={(event) => setFilterMaxAge(Math.min(99,Math.max(filterMinAge,Number(event.target.value) || 99)))} /></label></div>
          <label className="field-label">What they’re open to<select className="auth-input" value={filterIntention} onChange={(event) => setFilterIntention(event.target.value)}><option value="">Anything</option><option>Dating</option><option>Long-term relationship</option><option>Friends first</option><option>Open to possibilities</option></select></label>
          <label className="field-label">Gender<select className="auth-input" value={filterGender} onChange={(event) => setFilterGender(event.target.value)}><option value="">Any gender</option>{genderOptions.map(option => <option key={option}>{option}</option>)}</select></label>
          <label className="field-label">Broad area contains<input className="auth-input" value={filterArea} onChange={(event) => setFilterArea(event.target.value.slice(0,40))} placeholder="Downtown, west side…" /></label>
          <label className="adult-check visibility-check"><input type="checkbox" checked={filterOnlineOnly} onChange={(event) => setFilterOnlineOnly(event.target.checked)} /><span><strong>Here now only</strong><small>Hide bubbles belonging to members who are currently away.</small></span></label>
          <div className="filter-summary"><strong>{visiblePeople.length}</strong><span>people fit these filters in the current room</span></div><button className="primary full" onClick={() => setModal(null)}>Show these people <span>→</span></button><button className="signout-button" onClick={() => { setFilterMinAge(18); setFilterMaxAge(99); setFilterIntention(""); setFilterGender(""); setFilterArea(""); setFilterOnlineOnly(false); }}>Clear all filters</button>
        </> : modal === "roomchat" ? <>
          <p className="eyebrow">{activeRoom.toUpperCase()} ROOM</p><h2>Room conversation.</h2><p>Talk openly with the verified members sharing this room. Keep personal contact details private until trust is earned.</p><div className="room-chat-thread modal-room-chat" aria-live="polite">{roomMessages.length ? roomMessages.map(message => <article className={message.sender_id === userId ? "mine" : ""} key={message.id}><div><strong>{message.senderName}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time></div><p>{message.body}</p></article>) : <div className="room-chat-empty"><strong>The conversation is open.</strong><p>Be the first to say something about {activeRoom.toLowerCase()}.</p></div>}</div><textarea value={roomMessageText} onChange={event => setRoomMessageText(event.target.value.slice(0,500))} placeholder={`Say something to the ${activeRoom} room…`} aria-label="Room message"/><p className="character-note">{roomMessageText.length}/500</p><button className="primary full" onClick={sendRoomMessage} disabled={!roomMessageText.trim() || authBusy}>{authBusy ? "Sending…" : "Send to the room"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        </> : modal === "profile" ? <>
          <div className="profile-editor-head"><div className="modal-avatar sky">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your profile" /> : username.slice(0, 2).toUpperCase() || "ME"}</div><div><p className="eyebrow">MY PROFILE</p><h2>Make it feel like you.</h2></div></div>
          <p>This is what verified members see after opening your bubble. Keep it warm, specific, and free of surnames or social handles.</p>
          <span className="field-label">Profile photos · {photos.length}/5</span><div className="photo-grid">{photos.map(photo => <article className={photo.is_primary ? "primary-photo" : ""} key={photo.id}><img src={photo.url} alt={photo.is_primary ? "Primary profile" : "Profile"} /><span>{photo.is_primary ? "Bubble photo" : "Photo"}</span><div>{!photo.is_primary && <button type="button" onClick={() => makePrimaryPhoto(photo.id)} disabled={photoBusy}>Make primary</button>}<button type="button" onClick={() => removePhoto(photo)} disabled={photoBusy}>Remove</button></div></article>)}{photos.length < 5 && <label className="photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.target.value = ""; }} disabled={photoBusy} /><b>{photoBusy ? "…" : "+"}</b><strong>Add photo</strong><small>JPG, PNG or WebP</small></label>}</div>
          <p className="photo-privacy">Photos are compressed and stripped of location metadata before upload. Only verified members can view them.</p>
          <label className="field-label">Username<input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24))} placeholder="Your username" /></label>
          <label className="field-label">Broad area<input className="auth-input" value={broadArea} onChange={(event) => setBroadArea(event.target.value.slice(0, 80))} placeholder="West side, downtown, within 10 miles…" /></label>
          <label className="field-label">About me<textarea value={bio} onChange={(event) => setBio(event.target.value.slice(0, 500))} placeholder="A few details that make it easy for someone to start a real conversation…" /></label>
          <p className="character-note">{bio.length}/500 · Don’t include your surname, workplace, phone number, or social handle.</p>
          <label className="field-label">What I’m open to<select className="auth-input" value={intention} onChange={(event) => setIntention(event.target.value)}><option value="">Still figuring it out</option><option>Dating</option><option>Long-term relationship</option><option>Friends first</option><option>Open to possibilities</option></select></label>
          <label className="field-label">My gender<select className="auth-input" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Prefer not to say</option>{genderOptions.map(option => <option key={option}>{option}</option>)}</select></label>
          <span className="field-label">Genders I’m open to meeting</span><div className="interest-picker">{genderOptions.map(option => <button type="button" className={interestedIn.includes(option) ? "selected" : ""} key={option} onClick={() => setInterestedIn(current => current.includes(option) ? current.filter(value => value !== option) : [...current,option])}>{option}</button>)}</div>
          <div className="age-filter"><label className="field-label">Preferred minimum age<input className="auth-input" type="number" min="18" max="99" value={preferredMinAge} onChange={(event) => setPreferredMinAge(Math.max(18,Math.min(preferredMaxAge,Number(event.target.value) || 18)))} /></label><label className="field-label">Preferred maximum age<input className="auth-input" type="number" min="18" max="99" value={preferredMaxAge} onChange={(event) => setPreferredMaxAge(Math.min(99,Math.max(preferredMinAge,Number(event.target.value) || 99)))} /></label></div>
          <label className="field-label">Compatibility<select className="auth-input" value={compatibilityMode} onChange={(event) => setCompatibilityMode(event.target.value === "strict" ? "strict" : "suggested")}><option value="suggested">Suggested — show everyone, prioritize my preferences</option><option value="strict">Strict — only show mutually compatible profiles</option></select></label>
          <span className="field-label">My interests</span><div className="interest-picker">{["Food & coffee","Live music","Outdoors","Books & art","Things to do tonight"].map(item => <button type="button" className={interests.includes(item) ? "selected" : ""} key={item} onClick={() => setInterests(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{item}</button>)}</div>
          <label className="adult-check visibility-check"><input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} /><span><strong>Show my bubble in rooms</strong><small>Only verified members can open it. Turn this off anytime to step out of view.</small></span></label>
          <button className="primary full" onClick={updateProfile} disabled={username.length < 3 || !broadArea || interests.length === 0 || authBusy}>{authBusy ? "Saving…" : "Save my profile"} <span>→</span></button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="signout-button" onClick={() => {setAuthMessage("");setDeleteConfirmation("");setModal("account");}}>Manage or delete account</button><button className="signout-button" onClick={signOut}>Sign out</button>
        </> : modal === "account" ? <>
          <div className="modal-mark">○</div><p className="eyebrow">ACCOUNT CONTROL</p><h2>Your account, your choice.</h2><p>Pause your bubble without losing your profile, manage your $2.99 monthly membership, or permanently delete your account.</p><div className="account-progress"><span className={verified ? "done" : "current"}>Membership: {membershipStatus}</span></div>{adultVerified && !verified && <button className="primary full" onClick={startMembership} disabled={authBusy}>{authBusy ? "Opening secure checkout…" : "Start membership · $2.99/month"}</button>}{hasBillingAccount && <button className="primary full" onClick={manageBilling} disabled={authBusy}>Manage billing or cancel</button>}<button className="signout-button" onClick={pauseAccount} disabled={authBusy}>Pause and hide my bubble</button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<div className="danger-zone"><strong>Permanently delete account</strong><p>This cannot be undone. Your profile, photos, room activity, introductions, messages, blocks, and reports associated with your account will be removed according to our retention obligations. Cancel billing first if a paid membership is active.</p><label className="field-label">Type DELETE to confirm<input className="auth-input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())} /></label><button className="delete-account-button" onClick={deleteAccount} disabled={deleteConfirmation !== "DELETE" || authBusy}>{authBusy ? "Deleting…" : "Delete my account permanently"}</button></div><button className="signout-button" onClick={() => setModal("profile")}>Back to profile</button>
        </> : modal === "messages" ? <>
          <div className="modal-mark">↗</div><p className="eyebrow">MESSAGES</p><h2>Your conversations.</h2>{conversations.length > 0 && <div className="conversation-list">{conversations.map(item => <button key={item.id} onClick={() => void openConversation(item)}><span><strong>{item.otherName}</strong><small>{item.preview}</small></span>{item.unread > 0 && <b>{item.unread}</b>}</button>)}</div>}<p className="eyebrow inbox-divider">INTRODUCTIONS</p>{introductions.length ? <div className="introduction-inbox">{introductions.map(item => <article key={item.id}><div className="introduction-head"><strong>{item.incoming ? "From" : "To"} {item.personName}</strong><span className={`intro-state ${item.state}`}>{item.state}</span></div><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</small>{item.incoming && item.state === "pending" && <div className="introduction-actions"><button onClick={() => respondToIntroduction(item.id,"accepted")} disabled={authBusy}>Accept</button><button onClick={() => respondToIntroduction(item.id,"passed")} disabled={authBusy}>Pass</button><button onClick={() => respondToIntroduction(item.id,"reported")} disabled={authBusy}>Report</button></div>}</article>)}</div> : <div className="empty-messages"><div>✦</div><strong>No introductions yet</strong><p>Open a member’s bubble and send a thoughtful hello. An accepted introduction becomes a private conversation.</p></div>}{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="primary full" onClick={() => { setModal(null); document.getElementById("room")?.scrollIntoView(); }}>Return to the room <span>→</span></button>
        </> : modal === "chat" ? <>
          <p className="eyebrow">PRIVATE CONVERSATION</p><h2>{selectedConversation?.otherName}</h2><div className="chat-safety"><button onClick={() => selectedConversation && openReport(selectedConversation.otherId, selectedConversation.otherName)}>Report</button><button onClick={blockChatMember}>Block & remove</button></div><div className="chat-thread">{directMessages.length ? directMessages.map(message => <article className={message.sender_id === userId ? "mine" : "theirs"} key={message.id}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString([], {hour:"numeric",minute:"2-digit"})}</small></article>) : <p className="chat-empty">You both accepted the introduction. Start the conversation when you’re ready.</p>}</div><textarea value={messageText} onChange={(event) => setMessageText(event.target.value.slice(0,1000))} placeholder="Write a message…" aria-label="Private message"/><p className="character-note">{messageText.length}/1000 · Keep personal contact details private until trust is earned.</p><button className="primary full" onClick={sendDirectMessage} disabled={!messageText.trim() || authBusy}>{authBusy ? "Sending…" : "Send message"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="signout-button" onClick={() => setModal("messages")}>Back to messages</button>
        </> : modal === "report" ? <>
          <div className="modal-mark">!</div><p className="eyebrow">PRIVATE SAFETY REPORT</p><h2>Tell us what happened.</h2><p>Reports are never shown to {reportTarget?.name ?? "the other member"}. If you are in immediate danger, contact local emergency services.</p><label className="field-label">What best describes this?<select className="auth-input" value={reportReason} onChange={event => setReportReason(event.target.value)}><option>Harassment or unwanted contact</option><option>Threats or dangerous behavior</option><option>Fake identity or possible scam</option><option>Underage concern</option><option>Sexual content or boundary violation</option><option>Hate speech or discrimination</option><option>Spam or commercial solicitation</option><option>Something else</option></select></label><label className="field-label">Details<textarea value={reportDetails} onChange={event => setReportDetails(event.target.value.slice(0,1000))} placeholder="Share only what the safety team needs to understand the situation." /></label><p className="character-note">{reportDetails.length}/1000</p><button className="primary full" onClick={submitSafetyReport} disabled={authBusy}>{authBusy ? "Submitting…" : "Submit private report"}</button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="signout-button" onClick={() => setModal("messages")}>Return to messages</button>
        </> : modal === "admin" ? <>
          <div className="modal-mark">✓</div><p className="eyebrow">OWNER ONLY</p><h2>Verification & safety.</h2><p className="admin-privacy-note">Birthdates are displayed only here for adult-verification review. They are never placed on member profiles.</p><p className="eyebrow inbox-divider">AGE VERIFICATION</p><div className="admin-review-list">{verificationReviews.map(item => <article key={item.user_id}><div><strong>{item.username}</strong><small>{item.birth_date ? `Birth date: ${new Date(`${item.birth_date}T12:00:00`).toLocaleDateString()}` : "No birth date supplied"} · {item.status} · account {item.accountState}</small></div><div><button onClick={() => reviewVerification(item.user_id,"verified")} disabled={authBusy}>Approve 18+</button><button onClick={() => reviewVerification(item.user_id,"failed")} disabled={authBusy}>Reject</button><button onClick={() => setAccountState(item.user_id,"paused")}>Suspend</button><button onClick={() => setAccountState(item.user_id,"active")}>Restore</button><button onClick={() => setAccountState(item.user_id,"banned")}>Ban</button></div></article>)}</div><p className="eyebrow inbox-divider">SAFETY REPORTS</p>{safetyReports.length ? <div className="admin-review-list">{safetyReports.map(report => <article key={report.id}><div><strong>{report.status}</strong><p>{report.reason}</p><small>{new Date(report.created_at).toLocaleString()}</small></div><div><button onClick={() => reviewReport(report.id,"reviewed")}>Reviewed</button><button onClick={() => reviewReport(report.id,"actioned")}>Actioned</button><button onClick={() => reviewReport(report.id,"dismissed")}>Dismiss</button></div></article>)}</div> : <p>No safety reports are waiting.</p>}{authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        </> : modal === "invite" ? <>
          <div className="modal-mark">＋</div><p className="eyebrow">OPEN INVITATION</p><h2>What sounds good?</h2><p>Post a short plan for people who are online now. It automatically disappears after 24 hours.</p>
          <label className="field-label">Interest room<select className="auth-input" value={inviteRoom} onChange={(event) => setInviteRoom(event.target.value)}>{rooms.map(room => <option key={room.name}>{room.name}</option>)}</select></label>
          <textarea value={inviteText} onChange={(event) => setInviteText(event.target.value.slice(0, 280))} placeholder="I have tonight free—does anyone want to walk around the fair?" aria-label="Open invitation" />
          <p className="character-note">{inviteText.length}/280 · Your precise location is never included.</p>
          <button className="primary full" onClick={postInvitation} disabled={inviteText.trim().length < 5 || authBusy}>{authBusy ? "Posting…" : "Post for 24 hours"} <span>→</span></button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        </> : <>
          <div className="member-profile-head"><div className={`modal-avatar ${selected?.sample ? "sample-photo" : ""} ${selected?.tone}`} style={selected?.photoUrl ? undefined : {backgroundPosition:selected?.photoPosition}}>{selected?.photoUrl ? <img src={selected.photoUrl} alt={`${selected.name} profile`} /> : selected?.sample ? "" : selected?.initials}</div><div><p className="eyebrow">MEMBER PROFILE{selected?.sample ? " · SAMPLE" : ""}</p><h2>{selected?.name}</h2><p>{selected?.age ? `${selected.age} · ` : ""}{selected?.gender ? `${selected.gender} · ` : ""}{selected?.area} · <span className={selected?.online ? "profile-online" : "profile-away"}>{selected?.online ? "Here now" : "Away"}</span></p></div></div>
          <p className="profile-bio">{selected?.note}</p><div className="profile-tags">{selected?.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          {sent ? <div className="sent-note"><strong>Hello sent.</strong><p>Your introduction is waiting in their inbox. They can accept, politely pass, or report it—no awkward matching game.</p></div> : <><p className="profile-prompt">Feel a spark? Start with something from their profile.</p><textarea value={introductionText} onChange={(event) => setIntroductionText(event.target.value.slice(0,500))} aria-label="Introduction message"/><p className="character-note">{introductionText.length}/500 · Thoughtful introductions get thoughtful replies.</p><button className="primary full" onClick={sendIntroduction} disabled={!introductionText.trim() || authBusy}>{authBusy ? "Sending…" : "Send introduction"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}</>}{selected && !selected.sample && <><button className="signout-button" onClick={() => openReport(selected.id!, selected.name)}>Report this profile</button><button className="signout-button" onClick={blockSelectedMember} disabled={authBusy}>Hide & block this member</button></>}
        </>}
      </div></div>}
    </main>
  );
}
