"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type ProfilePhoto = { id: string; storage_path: string; is_primary: boolean; position: number; url: string };

async function prepareProfilePhoto(file: File) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("We couldn’t prepare that photo.")), "image/jpeg", .84));
}

const people = [
  { name: "CityFern", age: 31, area: "West side", note: "Museum afternoons, tiny restaurants, and laughing too loudly.", tags: ["Long-term", "Art", "Food"], initials: "CF", photoPosition: "0% 0%", tone: "coral", online: true },
  { name: "MilesAhead", age: 34, area: "North side", note: "Weekend cyclist. Weeknight cook. Looking for something steady.", tags: ["Long-term", "Outdoors", "Cooking"], initials: "MA", photoPosition: "50% 0%", tone: "sky", online: true },
  { name: "SundayStatic", age: 29, area: "Center city", note: "Live music, used bookstores, and a very opinionated rescue dog.", tags: ["Dating", "Music", "Dogs"], initials: "SS", photoPosition: "100% 0%", tone: "gold", online: true },
  { name: "SoftLaunch", age: 36, area: "East side", note: "Architect, amateur potter, professional finder of good coffee.", tags: ["Relationship", "Design", "Coffee"], initials: "SL", photoPosition: "0% 100%", tone: "plum", online: true },
  { name: "JuniperJune", age: 32, area: "South side", note: "Equal parts homebody and last-minute road trip.", tags: ["Dating", "Travel", "Books"], initials: "JJ", photoPosition: "50% 100%", tone: "mint", online: false },
  { name: "HeyItsRae", age: 30, area: "Within 10 miles", note: "Sunday brunch host. Terrible at trivia. Excellent teammate.", tags: ["Long-term", "Friends first", "Brunch"], initials: "HR", photoPosition: "100% 100%", tone: "rose", online: false },
];

const rooms = [
  { name: "Things to do tonight", icon: "✦", count: 18, color: "#ffb8d0" },
  { name: "Live music", icon: "♫", count: 12, color: "#bca9ff" },
  { name: "Food & coffee", icon: "☕", count: 21, color: "#edcf78" },
  { name: "Outdoors", icon: "☀", count: 9, color: "#91e7dc" },
  { name: "Books & art", icon: "◌", count: 14, color: "#f5b49f" },
];

export default function Home() {
  const [browserReady, setBrowserReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [modal, setModal] = useState<"verify" | "onboarding" | "profile" | "hello" | "invite" | "messages" | null>(null);
  const [selected, setSelected] = useState<(typeof people)[number] | null>(null);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [broadArea, setBroadArea] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [intention, setIntention] = useState("");
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
  const [roomOffset, setRoomOffset] = useState({ x: 0, y: 0 });
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeMoved = useRef(false);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [activeRoom, setActiveRoom] = useState("Food & coffee");
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);

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
    if (!supabase) return;
    const refreshAccess = async (userId?: string) => {
      setSignedIn(Boolean(userId));
      if (!userId) { setVerified(false); setProfileReady(false); return; }
      const [{ data: account }, { data: profile }, { data: request }] = await Promise.all([
        supabase.from("accounts").select("state, verification, membership_active").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("username, broad_area, interests, bio, intentions, discoverable").eq("user_id", userId).maybeSingle(),
        supabase.from("verification_requests").select("status").eq("user_id", userId).maybeSingle(),
      ]);
      setProfileReady(Boolean(profile));
      if (profile) { setUsername(profile.username); setBroadArea(profile.broad_area ?? ""); setInterests(profile.interests ?? []); setBio(profile.bio ?? ""); setIntention(profile.intentions?.[0] ?? ""); setDiscoverable(profile.discoverable ?? false); }
      setVerificationStatus(request?.status ?? account?.verification ?? "unverified");
      setVerified(account?.state === "active" && account.verification === "verified" && account.membership_active === true);
      if (profile) await loadPhotos(userId);
      setModal(profile ? null : "onboarding");
    };
    supabase.auth.getSession().then(({ data }) => void refreshAccess(data.session?.user.id));
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

  const enter = () => setModal("verify");
  const submitAuth = async () => {
    if (!supabase || !email || password.length < 8) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { data, error } = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) {
      const rateLimited = error.message.toLowerCase().includes("rate") || error.status === 429;
      setAuthMessage(rateLimited ? "Email sending is temporarily paused. Please wait about an hour before creating a new account. Existing members can still sign in with their password." : error.message);
      return;
    }
    if (authMode === "signup" && !data.session) setAuthMessage("Account created. Check your email once to confirm it, then return here and sign in.");
    else { setSignedIn(true); setModal("onboarding"); }
  };
  const saveProfile = async () => {
    if (!supabase || !adultConfirmed || !username || !birthDate || !broadArea || interests.length === 0) return;
    setAuthBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) { setAuthBusy(false); return setAuthMessage("Please sign in again."); }
    const adultCutoff = new Date(); adultCutoff.setFullYear(adultCutoff.getFullYear() - 18);
    if (new Date(`${birthDate}T12:00:00`) > adultCutoff) { setAuthBusy(false); return setAuthMessage("Meet Freely is only available to adults age 18 and older."); }
    const [{ error: profileError }, { error: verificationError }] = await Promise.all([
      supabase.from("profiles").upsert({ user_id: userId, username, broad_area: broadArea, interests, discoverable: false }),
      supabase.from("verification_requests").upsert({ user_id: userId, adult_attested: true, birth_date: birthDate, status: "pending", submitted_at: new Date().toISOString() }),
    ]);
    const error = profileError ?? verificationError;
    setAuthBusy(false);
    if (error) return setAuthMessage(error.message);
    setProfileReady(true); setVerificationStatus("pending"); setAuthMessage("");
  };
  const signOut = async () => { await supabase?.auth.signOut(); setSignedIn(false); setVerified(false); setProfileReady(false); setModal(null); };
  const updateProfile = async () => {
    if (!supabase || username.length < 3 || !broadArea || interests.length === 0) return;
    setAuthBusy(true); setAuthMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) { setAuthBusy(false); return setAuthMessage("Please sign in again."); }
    const { error } = await supabase.from("profiles").update({ username, broad_area: broadArea, bio: bio.trim() || null, intentions: intention ? [intention] : [], interests, discoverable }).eq("user_id", userId);
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
    setInviteText(""); setAuthMessage("Your invitation is live for 24 hours.");
  };
  const hideDraggedPerson = () => {
    if (!draggingPerson) return;
    setHiddenPeople(current => [...current, draggingPerson]);
    setDraggingPerson(null);
  };
  const hello = (person: (typeof people)[number]) => { setSelected(person); setSent(false); setModal("hello"); };
  const installApp = async () => {
    if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); return; }
    setInstallHelpOpen(true);
  };
  const useNearbyLocation = () => navigator.geolocation?.getCurrentPosition(() => setLocationReady(true), () => setLocationReady(false), { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 });
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
  const activeRoomDetails = rooms.find(room => room.name === activeRoom) ?? rooms[2];
  const openMyProfile = () => { setAuthMessage(""); setModal("profile"); };

  if (!browserReady) {
    return <main className="app-loading" aria-busy="true"><div className="loading-bubble"><span>●</span><strong>meet freely</strong><small>Opening the room…</small></div></main>;
  }

  return (
    <main className={signedIn && verified ? "member-session" : "visitor-session"}>
      {signedIn && verified && <section className="mobile-app" aria-label="Meet Freely member room">
        <header className="mobile-app-bar"><button className="app-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open app menu">☰</button><div><small>{activeRoom.toUpperCase()} · {locationReady ? "NEARBY FIRST" : broadArea.toUpperCase()}</small><strong>{activeRoomDetails.count + 1} here recently</strong></div><button className="my-mini-bubble" onClick={openMyProfile} aria-label="Edit my profile">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your profile" /> : username.slice(0, 2).toUpperCase() || "ME"}</button></header>
        <div className="mobile-room" onPointerDown={beginRoomSwipe} onPointerMove={moveRoom} onPointerUp={endRoomSwipe} onPointerCancel={endRoomSwipe}>
          <div className="mobile-bubble-field" style={{ transform: `translate(${roomOffset.x}px, ${roomOffset.y}px)` }}>
          <button className="mobile-own-bubble" onClick={openMyProfile}><span className="bubble-photo">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your primary profile" /> : username.slice(0, 2).toUpperCase() || "ME"}</span><strong>{username || "Your bubble"}</strong><small>You · tap to edit</small><span className="presence"><i />Here now</span></button>
          {people.filter(person => !hiddenPeople.includes(person.name)).map((person, index) => <div role="button" tabIndex={0} key={person.name} className={`mobile-member-bubble mobile-bubble-${index + 1} ${person.tone} ${person.online ? "is-online" : "is-offline"} ${pinnedPeople.includes(person.name) ? "is-pinned" : ""}`} onClick={() => { if (!swipeMoved.current) hello(person); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") hello(person); }}><button className="bubble-pin" onClick={(event) => { event.stopPropagation(); setPinnedPeople(current => current.includes(person.name) ? current.filter(name => name !== person.name) : [...current, person.name]); }} aria-label={pinnedPeople.includes(person.name) ? `Unpin ${person.name}` : `Pin ${person.name}`}>{pinnedPeople.includes(person.name) ? "●" : "⌖"}</button><span className="bubble-photo sample-photo" style={{backgroundPosition:person.photoPosition}} /><strong>{person.name}</strong><small>{person.age} · {person.area}</small><span className="presence"><i />{person.online ? "Here now" : "Away"}</span></div>)}
          </div>{swipeHintVisible && <span className="swipe-hint">Swipe the room to explore farther</span>}
          <button className="mobile-invite-action" onClick={() => { setAuthMessage(""); setModal("invite"); }}>＋ <span>Post an invitation</span></button>
        </div>
        {mobileMenuOpen && <><button className="drawer-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" /><aside className="app-drawer" aria-label="App menu"><div className="drawer-head"><span className="brand"><i className="brand-dot">●</i> meet freely</span><button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">×</button></div><button className="nearby-control" onClick={useNearbyLocation}><span>◎</span><div><strong>{locationReady ? "Nearby sorting is on" : "Show people nearest first"}</strong><small>{locationReady ? "Approximate location stays private" : `Or keep using ${broadArea}`}</small></div></button><p className="drawer-label">ROOMS</p>{rooms.map(room => <button className={`drawer-room ${activeRoom === room.name ? "is-active" : ""}`} aria-current={activeRoom === room.name ? "page" : undefined} key={room.name} onClick={() => { setActiveRoom(room.name); setRoomOffset({x:0,y:0}); setSwipeHintVisible(true); setMobileMenuOpen(false); }}><span style={{background:room.color}}>{room.icon}</span><strong>{room.name}</strong><small>{room.count} here</small></button>)}<div className="drawer-links"><button onClick={() => { setMobileMenuOpen(false); setModal("invite"); }}>Open invitations</button><button onClick={() => { setMobileMenuOpen(false); setModal("messages"); }}>Messages <span className="menu-badge">0</span></button><button onClick={() => { setMobileMenuOpen(false); openMyProfile(); }}>My profile</button><button onClick={installApp}>Add Meet Freely to Home Screen</button><a href="#safety" onClick={() => setMobileMenuOpen(false)}>Safety & privacy</a><button onClick={signOut}>Sign out</button></div></aside></>}
        {installHelpOpen && <div className="install-lightbox" role="dialog" aria-modal="true"><button className="close" onClick={() => setInstallHelpOpen(false)} aria-label="Close">×</button><div className="install-icon">●</div><p className="eyebrow">KEEP THE ROOM CLOSE</p><h2>Add Meet Freely to your Home Screen</h2><p><strong>On iPhone:</strong> tap the Share button in Safari, then choose <em>Add to Home Screen</em>.</p><p><strong>On Android:</strong> open the browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</p><button className="primary full" onClick={() => setInstallHelpOpen(false)}>Got it</button></div>}
      </section>}
      <nav className="nav">
        <a className="brand" href="#top" aria-label="Meet Freely home"><span className="brand-dot">●</span> meet freely</a>
        <div className="nav-links"><a href="#how">How it works</a><a href="#safety">Safety</a><button className="text-button" onClick={() => signedIn ? setModal(profileReady ? "profile" : "onboarding") : enter()}>{profileReady ? "My profile" : signedIn ? "Finish profile" : "Sign in"}</button></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> 86 people are open to meeting nearby</p>
          <h1>Dating should feel like <em>walking into a room.</em></h1>
          <p className="lede">Look around. Notice someone. Say hello. No swiping, hidden likes, boosts, or algorithm deciding who gets seen.</p>
          <div className="hero-actions">
            <button className="primary" onClick={verified ? () => document.getElementById("room")?.scrollIntoView({ behavior: "smooth" }) : signedIn ? () => setModal("onboarding") : enter}>{verified ? "Enter the room" : signedIn ? "Continue account setup" : "Create a private account"}<span>→</span></button>
            <span className="price">$2.99/month<br/><small>One simple membership</small></span>
          </div>
          <p className="privacy-note">Visitor Preview protects member identities. Real profiles are only visible to verified adults.</p>
        </div>

        <div className="room-window" aria-label={verified ? "Member room preview" : "Protected visitor preview"}>
          <div className="window-top"><span>THE LOCAL ROOM</span><span className="active"><i /> 86 here recently</span></div>
          <div className={`preview-bubbles ${verified ? "revealed" : "protected"}`}>
            {people.slice(0, 4).map((person, index) => <div className={`member-bubble preview-bubble bubble-${index + 1} ${person.tone}`} key={person.name}><div className={`bubble-photo ${verified ? "sample-photo" : ""}`} style={verified ? {backgroundPosition:person.photoPosition} : undefined}>{verified ? "" : "•"}</div><strong>{verified ? person.name : "Someone’s here"}</strong><small>{verified ? `${person.age} · ${person.area}` : "Identity protected"}</small></div>)}
          </div>
          {!verified && <div className="privacy-shield"><div className="lock">⌁</div><strong>People, not a public catalog.</strong><span>Verify to see who’s inside.</span><button onClick={enter}>Enter securely</button></div>}
        </div>
      </section>

      <section className="promise-strip"><span>No swipe queue</span><span>No paid boosts</span><span>No hidden likes</span><span>No precise locations</span></section>

      <section className="invites-section" id="invites">
        <div className="section-heading"><div><p className="eyebrow">OPEN INVITATIONS</p><h2>See who wants to do something.</h2></div><p className="section-note">Short, timely posts from people who are online now. They disappear automatically, so the list always feels alive.</p></div>
        <div className="invite-layout">
          <div className="invite-feed">
            <article className="invite-card" onClick={() => verified ? hello(people[0]) : enter()}>
              <div className={`invite-avatar coral ${verified ? "sample-photo" : ""}`} style={verified ? {backgroundPosition:people[0].photoPosition} : undefined}>{verified ? "" : "•"}<i /></div>
              <div><div className="invite-meta"><strong>{verified ? "CityFern" : "Verified member"}</strong><span>Tonight</span></div><p>{verified ? "I’m off this evening—anyone want to walk around the fair?" : "Verify your account to read this open invitation."}</p><small>Things to do tonight · West side</small></div><button>Message <span>→</span></button>
            </article>
            <article className="invite-card" onClick={() => verified ? hello(people[2]) : enter()}>
              <div className={`invite-avatar gold ${verified ? "sample-photo" : ""}`} style={verified ? {backgroundPosition:people[2].photoPosition} : undefined}>{verified ? "" : "•"}<i /></div>
              <div><div className="invite-meta"><strong>{verified ? "SundayStatic" : "Verified member"}</strong><span>Tonight</span></div><p>{verified ? "There’s a tiny jazz show at 8. I’d love some company." : "Verify your account to read this open invitation."}</p><small>Live music · Center city</small></div><button>Message <span>→</span></button>
            </article>
            <button className="post-invite" onClick={verified ? () => { setAuthMessage(""); setModal("invite"); } : enter}><span>＋</span><div><strong>Post an open invitation</strong><small>Tell the room what you feel like doing.</small></div></button>
          </div>
          <aside className="interest-rooms"><p className="eyebrow">BROWSE ROOMS</p>{rooms.map(room => <button className={activeRoom === room.name ? "selected-room" : ""} aria-current={activeRoom === room.name ? "page" : undefined} key={room.name} onClick={() => { setActiveRoom(room.name); setRoomOffset({x:0,y:0}); document.getElementById("room")?.scrollIntoView({behavior:"smooth"}); }}><span className={`room-icon ${room.name === "Live music" ? "plum" : room.name === "Food & coffee" ? "gold" : room.name === "Outdoors" ? "mint" : "coral"}`}>{room.icon}</span><div><strong>{room.name}</strong><small>{room.count} here recently</small></div><b>{activeRoom === room.name ? "✓" : "→"}</b></button>)}</aside>
        </div>
      </section>

      <section className="room-section" id="room">
        <div className="section-heading"><div><p className="eyebrow"><span className="live-dot" /> {activeRoom.toUpperCase()} ROOM</p><h2>Everyone here shares an interest.</h2><p className="desktop-room-count">{activeRoomDetails.count} people have been here recently · nearest broad areas first</p></div><div className="filters"><button className="active-filter">Here now</button><button onClick={() => document.getElementById("invites")?.scrollIntoView({behavior:"smooth"})}>Open invitations</button><button onClick={() => setModal("messages")}>Messages</button></div></div>
        <div className={`bubble-room ${!verified ? "visitor-room" : ""}`}>
          {people.filter(person => !hiddenPeople.includes(person.name)).map((person, index) => (
            <div role="button" tabIndex={0} draggable className={`member-bubble room-bubble bubble-${index + 1} ${person.tone} ${person.online ? "is-online" : "is-offline"} ${pinnedPeople.includes(person.name) ? "is-pinned" : ""}`} key={person.name} onDragStart={() => setDraggingPerson(person.name)} onDragEnd={() => setDraggingPerson(null)} onClick={() => verified ? hello(person) : enter()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") verified ? hello(person) : enter(); }} aria-label={verified ? `Open ${person.name} profile` : "Verify to meet people in this room"}>
              {verified && <button className="desktop-bubble-pin" onClick={(event) => { event.stopPropagation(); setPinnedPeople(current => current.includes(person.name) ? current.filter(name => name !== person.name) : [...current, person.name]); }} aria-label={pinnedPeople.includes(person.name) ? `Unpin ${person.name}` : `Pin ${person.name}`}>{pinnedPeople.includes(person.name) ? "●" : "⌖"}</button>}
              <span className="bubble-shine" />
              <span className={`bubble-photo ${verified ? "sample-photo" : ""}`} style={verified ? {backgroundPosition:person.photoPosition} : undefined}>{verified ? "" : "•"}</span>
              <strong>{verified ? person.name : "Verified person"}</strong>
              <small>{verified ? `${person.age} · ${person.area}` : "Identity protected"}</small>
              <span className="presence"><i />{person.online ? "Here now" : "Away"}</span>
            </div>
          ))}
          {verified ? <button className="desktop-own-bubble" onClick={openMyProfile}><span className="bubble-photo">{primaryPhoto?.url ? <img src={primaryPhoto.url} alt="Your primary profile" /> : username.slice(0,2).toUpperCase() || "ME"}</span><strong>{username || "Your bubble"}</strong><small>You · tap to edit</small><span className="presence"><i />Here now</span></button> : <div className="room-center"><span>{activeRoom.toUpperCase()}</span><strong>{activeRoomDetails.count} nearby</strong><small>Verify to see and meet everyone in this room.</small></div>}
          <div className={`block-dock ${draggingPerson ? "is-ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={hideDraggedPerson}><span>×</span><strong>Hide & block</strong><small>Drag someone here for mutual invisibility</small></div>
          {hiddenPeople.length > 0 && <button className="undo-hide" onClick={() => setHiddenPeople(current => current.slice(0, -1))}>Undo last hide</button>}
        </div>
      </section>

      <section className="how" id="how">
        <div className="how-intro"><p className="eyebrow">HOW IT WORKS</p><h2>No matching machinery.<br/>Just a better room.</h2><p>Meet Freely gives adults the freedom to discover and approach each other—while keeping member profiles private from unverified visitors.</p></div>
        <div className="steps">
          <article><b>01</b><h3>Verify once</h3><p>A quick age and identity check keeps the room human. Your legal identity is never shown to members.</p></article>
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
        <div className="price-card"><span>Verified membership</span><strong><sup>$</sup>2.99<small>/month</small></strong><ul><li>See everyone in your rooms</li><li>Send and receive introductions</li><li>See every like—immediately</li><li>No ads, boosts, or visibility tiers</li></ul><button className="primary dark" onClick={enter}>Join the room <span>→</span></button><small>Cancel anytime. No surprise upgrades.</small></div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-dot">●</span> meet freely</a><p>Meet freely. No match required.</p><div><a href="#safety">Safety</a><a href="#">Community rules</a><a href="#">Privacy</a></div></footer>

      {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><div className="modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close" onClick={() => setModal(null)} aria-label="Close">×</button>
        {modal === "verify" ? <>
          <div className="modal-mark">✓</div><p className="eyebrow">PRIVATE ACCOUNT</p><h2>{authMode === "signin" ? "Welcome back." : "Join the room."}</h2><p>Use your email and password. Your email and legal identity are never shown on your dating profile.</p>
          <div className="auth-tabs"><button className={authMode === "signin" ? "active" : ""} onClick={() => { setAuthMode("signin"); setAuthMessage(""); }}>Sign in</button><button className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}>Create account</button></div>
          <input className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-label="Email address" />
          <input className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" aria-label="Password" />
          <button className="primary full" onClick={submitAuth} disabled={!email || password.length < 8 || authBusy || !isSupabaseConfigured}>{authBusy ? "Working…" : authMode === "signin" ? "Sign in" : "Create my private account"} <span>→</span></button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}<small className="modal-foot">New accounts receive one confirmation email. Profile access still requires adult verification and active membership.</small>
        </> : modal === "onboarding" ? <>
          <div className="modal-mark">✓</div><p className="eyebrow">{profileReady ? "ACCOUNT STATUS" : "PRIVATE PROFILE"}</p><h2>{profileReady ? "Your place is saved." : "Make your bubble yours."}</h2>
          {profileReady ? <><div className="account-progress"><span className="done">✓ Email confirmed</span><span className="done">✓ Private profile created</span><span className={verificationStatus === "verified" ? "done" : "current"}>{verificationStatus === "verified" ? "✓" : "3"} Adult verification {verificationStatus}</span><span>4 Membership activation</span></div><p>Your profile remains invisible until adult verification and membership are active. Unverified visitors cannot view it while you wait.</p><button className="primary full" onClick={() => setModal(null)}>Return to Meet Freely <span>→</span></button><button className="signout-button" onClick={signOut}>Sign out</button></> : <><p>Use a username—not your surname or social handle. Only your broad area is shown.</p><input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24))} placeholder="Private username" aria-label="Private username" /><input className="auth-input" value={broadArea} onChange={(event) => setBroadArea(event.target.value.slice(0, 80))} placeholder="Broad area, e.g. West side" aria-label="Broad area" /><label className="field-label">Date of birth<input className="auth-input" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label><div className="interest-picker">{["Food & coffee","Live music","Outdoors","Books & art","Things to do tonight"].map(item => <button type="button" className={interests.includes(item) ? "selected" : ""} key={item} onClick={() => setInterests(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{item}</button>)}</div><label className="adult-check"><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /> I confirm this birth date is mine and I am at least 18 years old.</label><button className="primary full" onClick={saveProfile} disabled={!adultConfirmed || username.length < 3 || !broadArea || !birthDate || interests.length === 0 || authBusy}>{authBusy ? "Saving…" : "Submit for verification"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<small className="modal-foot">Your birth date is private and is never placed on your dating profile.</small></>}
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
          <span className="field-label">My interests</span><div className="interest-picker">{["Food & coffee","Live music","Outdoors","Books & art","Things to do tonight"].map(item => <button type="button" className={interests.includes(item) ? "selected" : ""} key={item} onClick={() => setInterests(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{item}</button>)}</div>
          <label className="adult-check visibility-check"><input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} /><span><strong>Show my bubble in rooms</strong><small>Only verified members can open it. Turn this off anytime to step out of view.</small></span></label>
          <button className="primary full" onClick={updateProfile} disabled={username.length < 3 || !broadArea || interests.length === 0 || authBusy}>{authBusy ? "Saving…" : "Save my profile"} <span>→</span></button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="signout-button" onClick={signOut}>Sign out</button>
        </> : modal === "messages" ? <>
          <div className="modal-mark">↗</div><p className="eyebrow">INTRODUCTIONS</p><h2>Your conversations start here.</h2><div className="empty-messages"><div>✦</div><strong>No messages yet</strong><p>When someone replies to an introduction—or sends one to you—it will appear here without a matching game.</p></div><button className="primary full" onClick={() => { setModal(null); document.getElementById("room")?.scrollIntoView(); }}>Return to the room <span>→</span></button>
        </> : modal === "invite" ? <>
          <div className="modal-mark">＋</div><p className="eyebrow">OPEN INVITATION</p><h2>What sounds good?</h2><p>Post a short plan for people who are online now. It automatically disappears after 24 hours.</p>
          <label className="field-label">Interest room<select className="auth-input" value={inviteRoom} onChange={(event) => setInviteRoom(event.target.value)}>{rooms.map(room => <option key={room.name}>{room.name}</option>)}</select></label>
          <textarea value={inviteText} onChange={(event) => setInviteText(event.target.value.slice(0, 280))} placeholder="I have tonight free—does anyone want to walk around the fair?" aria-label="Open invitation" />
          <p className="character-note">{inviteText.length}/280 · Your precise location is never included.</p>
          <button className="primary full" onClick={postInvitation} disabled={inviteText.trim().length < 5 || authBusy}>{authBusy ? "Posting…" : "Post for 24 hours"} <span>→</span></button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        </> : <>
          <div className="member-profile-head"><div className={`modal-avatar sample-photo ${selected?.tone}`} style={{backgroundPosition:selected?.photoPosition}} /><div><p className="eyebrow">MEMBER PROFILE · SAMPLE</p><h2>{selected?.name}</h2><p>{selected?.age} · {selected?.area} · <span className={selected?.online ? "profile-online" : "profile-away"}>{selected?.online ? "Here now" : "Away"}</span></p></div></div>
          <p className="profile-bio">{selected?.note}</p><div className="profile-tags">{selected?.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          {sent ? <div className="sent-note"><strong>Hello sent.</strong><p>Your introduction is waiting in their inbox. They can accept, politely pass, or report it—no awkward matching game.</p></div> : <><p className="profile-prompt">Feel a spark? Start with something from their profile.</p><textarea defaultValue={`Your note about ${selected?.tags[1].toLowerCase()} caught my attention—what got you into it?`} aria-label="Introduction message"/><p className="character-note">Thoughtful introductions get thoughtful replies.</p><button className="primary full" onClick={() => setSent(true)}>Send introduction <span>→</span></button></>}
        </>}
      </div></div>}
    </main>
  );
}
