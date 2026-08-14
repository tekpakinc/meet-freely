"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const people = [
  { name: "CityFern", age: 31, area: "West side", note: "Museum afternoons, tiny restaurants, and laughing too loudly.", tags: ["Long-term", "Art", "Food"], initials: "CF", tone: "coral", online: true },
  { name: "MilesAhead", age: 34, area: "North side", note: "Weekend cyclist. Weeknight cook. Looking for something steady.", tags: ["Long-term", "Outdoors", "Cooking"], initials: "MA", tone: "sky", online: true },
  { name: "SundayStatic", age: 29, area: "Center city", note: "Live music, used bookstores, and a very opinionated rescue dog.", tags: ["Dating", "Music", "Dogs"], initials: "SS", tone: "gold", online: true },
  { name: "SoftLaunch", age: 36, area: "East side", note: "Architect, amateur potter, professional finder of good coffee.", tags: ["Relationship", "Design", "Coffee"], initials: "SL", tone: "plum", online: true },
  { name: "JuniperJune", age: 32, area: "South side", note: "Equal parts homebody and last-minute road trip.", tags: ["Dating", "Travel", "Books"], initials: "JJ", tone: "mint", online: false },
  { name: "HeyItsRae", age: 30, area: "Within 10 miles", note: "Sunday brunch host. Terrible at trivia. Excellent teammate.", tags: ["Long-term", "Friends first", "Brunch"], initials: "HR", tone: "rose", online: false },
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
  const [modal, setModal] = useState<"verify" | "onboarding" | "hello" | null>(null);
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
  const [verificationStatus, setVerificationStatus] = useState("unverified");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [hiddenPeople, setHiddenPeople] = useState<string[]>([]);
  const [draggingPerson, setDraggingPerson] = useState<string | null>(null);

  useEffect(() => {
    setBrowserReady(true);
    if (!supabase) return;
    const refreshAccess = async (userId?: string) => {
      setSignedIn(Boolean(userId));
      if (!userId) { setVerified(false); setProfileReady(false); return; }
      const [{ data: account }, { data: profile }, { data: request }] = await Promise.all([
        supabase.from("accounts").select("state, verification, membership_active").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("username, broad_area, interests").eq("user_id", userId).maybeSingle(),
        supabase.from("verification_requests").select("status").eq("user_id", userId).maybeSingle(),
      ]);
      setProfileReady(Boolean(profile));
      if (profile) { setUsername(profile.username); setBroadArea(profile.broad_area ?? ""); setInterests(profile.interests ?? []); }
      setVerificationStatus(request?.status ?? account?.verification ?? "unverified");
      setVerified(account?.state === "active" && account.verification === "verified" && account.membership_active === true);
      setModal(profile ? null : "onboarding");
    };
    supabase.auth.getSession().then(({ data }) => void refreshAccess(data.session?.user.id));
  }, []);

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
  const hideDraggedPerson = () => {
    if (!draggingPerson) return;
    setHiddenPeople(current => [...current, draggingPerson]);
    setDraggingPerson(null);
  };
  const hello = (person: (typeof people)[number]) => { setSelected(person); setSent(false); setModal("hello"); };

  if (!browserReady) {
    return <main className="app-loading" aria-busy="true"><div className="loading-bubble"><span>●</span><strong>meet freely</strong><small>Opening the room…</small></div></main>;
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="Meet Freely home"><span className="brand-dot">●</span> meet freely</a>
        <div className="nav-links"><a href="#how">How it works</a><a href="#safety">Safety</a><button className="text-button" onClick={() => signedIn ? setModal("onboarding") : enter()}>{verified ? "Verified member" : signedIn ? "My account" : "Sign in"}</button></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> 86 people are open to meeting nearby</p>
          <h1>Dating should feel like <em>walking into a room.</em></h1>
          <p className="lede">Look around. Notice someone. Say hello. No swiping, hidden likes, boosts, or algorithm deciding who gets seen.</p>
          <div className="hero-actions">
            <button className="primary" onClick={verified ? () => document.getElementById("room")?.scrollIntoView({ behavior: "smooth" }) : signedIn ? () => setModal("onboarding") : enter}>{verified ? "Enter the room" : signedIn ? "Continue account setup" : "Create a private account"}<span>→</span></button>
            <span className="price">$1.99/month<br/><small>One simple membership</small></span>
          </div>
          <p className="privacy-note">Visitor Preview protects member identities. Real profiles are only visible to verified adults.</p>
        </div>

        <div className="room-window" aria-label={verified ? "Member room preview" : "Protected visitor preview"}>
          <div className="window-top"><span>THE LOCAL ROOM</span><span className="active"><i /> 86 here recently</span></div>
          <div className={`preview-bubbles ${verified ? "revealed" : "protected"}`}>
            {people.slice(0, 4).map((person, index) => <div className={`member-bubble preview-bubble bubble-${index + 1} ${person.tone}`} key={person.name}><div className="bubble-photo">{verified ? person.initials : "•"}</div><strong>{verified ? person.name : "Someone’s here"}</strong><small>{verified ? `${person.age} · ${person.area}` : "Identity protected"}</small></div>)}
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
              <div className="invite-avatar coral">{verified ? "CF" : "•"}<i /></div>
              <div><div className="invite-meta"><strong>{verified ? "CityFern" : "Verified member"}</strong><span>Tonight</span></div><p>{verified ? "I’m off this evening—anyone want to walk around the fair?" : "Verify your account to read this open invitation."}</p><small>Things to do tonight · West side</small></div><button>Message <span>→</span></button>
            </article>
            <article className="invite-card" onClick={() => verified ? hello(people[2]) : enter()}>
              <div className="invite-avatar gold">{verified ? "SS" : "•"}<i /></div>
              <div><div className="invite-meta"><strong>{verified ? "SundayStatic" : "Verified member"}</strong><span>Tonight</span></div><p>{verified ? "There’s a tiny jazz show at 8. I’d love some company." : "Verify your account to read this open invitation."}</p><small>Live music · Center city</small></div><button>Message <span>→</span></button>
            </article>
            <button className="post-invite" onClick={verified ? () => setModal("onboarding") : enter}><span>＋</span><div><strong>Post an open invitation</strong><small>Tell the room what you feel like doing.</small></div></button>
          </div>
          <aside className="interest-rooms"><p className="eyebrow">BROWSE ROOMS</p>{rooms.map(room => <button key={room.name}><span className={`room-icon ${room.name === "Live music" ? "plum" : room.name === "Food & coffee" ? "gold" : room.name === "Outdoors" ? "mint" : "coral"}`}>{room.icon}</span><div><strong>{room.name}</strong><small>{room.count} here now</small></div><b>→</b></button>)}</aside>
        </div>
      </section>

      <section className="room-section" id="room">
        <div className="section-heading"><div><p className="eyebrow">FOOD & COFFEE ROOM</p><h2>Everyone here shares an interest.</h2></div><div className="filters"><button className="active-filter">Here now</button><button>Open invitations</button><button>Room chat</button></div></div>
        <div className={`bubble-room ${!verified ? "visitor-room" : ""}`}>
          {people.filter(person => !hiddenPeople.includes(person.name)).map((person, index) => (
            <button draggable className={`member-bubble room-bubble bubble-${index + 1} ${person.tone} ${person.online ? "is-online" : "is-offline"}`} key={person.name} onDragStart={() => setDraggingPerson(person.name)} onDragEnd={() => setDraggingPerson(null)} onClick={() => verified ? hello(person) : enter()} aria-label={verified ? `Open ${person.name} profile` : "Verify to meet people in this room"}>
              <span className="bubble-shine" />
              <span className="bubble-photo">{verified ? person.initials : "•"}</span>
              <strong>{verified ? person.name : "Verified person"}</strong>
              <small>{verified ? `${person.age} · ${person.area}` : "Identity protected"}</small>
              <span className="presence"><i />{person.online ? "Here now" : "Away"}</span>
            </button>
          ))}
          <div className="room-center"><span>FOOD & COFFEE</span><strong>{people.filter(person => person.online && !hiddenPeople.includes(person.name)).length} here now</strong><small>Chat with the room or say hello privately.</small></div>
          <div className={`block-dock ${draggingPerson ? "is-ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={hideDraggedPerson}><span>×</span><strong>Hide & block</strong><small>Drag someone here for mutual invisibility</small></div>
          {hiddenPeople.length > 0 && <button className="undo-hide" onClick={() => setHiddenPeople(current => current.slice(0, -1))}>Undo last hide</button>}
        </div>
      </section>

      <section className="how" id="how">
        <div className="how-intro"><p className="eyebrow">HOW IT WORKS</p><h2>No matching machinery.<br/>Just a better room.</h2><p>Meet Freely gives adults the freedom to discover and approach each other—while protecting the people inside from spectators.</p></div>
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
        <div className="price-card"><span>Verified membership</span><strong><sup>$</sup>1.99<small>/month</small></strong><ul><li>See everyone in your rooms</li><li>Send and receive introductions</li><li>See every like—immediately</li><li>No ads, boosts, or visibility tiers</li></ul><button className="primary dark" onClick={enter}>Join the room <span>→</span></button><small>Cancel anytime. No surprise upgrades.</small></div>
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
          {profileReady ? <><div className="account-progress"><span className="done">✓ Email confirmed</span><span className="done">✓ Private profile created</span><span className={verificationStatus === "verified" ? "done" : "current"}>{verificationStatus === "verified" ? "✓" : "3"} Adult verification {verificationStatus}</span><span>4 Membership activation</span></div><p>Your profile remains invisible until adult verification and membership are active. No one can spectate while you wait.</p><button className="primary full" onClick={() => setModal(null)}>Return to Meet Freely <span>→</span></button><button className="signout-button" onClick={signOut}>Sign out</button></> : <><p>Use a username—not your surname or social handle. Only your broad area is shown.</p><input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24))} placeholder="Private username" aria-label="Private username" /><input className="auth-input" value={broadArea} onChange={(event) => setBroadArea(event.target.value.slice(0, 80))} placeholder="Broad area, e.g. West side" aria-label="Broad area" /><label className="field-label">Date of birth<input className="auth-input" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label><div className="interest-picker">{["Food & coffee","Live music","Outdoors","Books & art","Things to do tonight"].map(item => <button type="button" className={interests.includes(item) ? "selected" : ""} key={item} onClick={() => setInterests(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{item}</button>)}</div><label className="adult-check"><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /> I confirm this birth date is mine and I am at least 18 years old.</label><button className="primary full" onClick={saveProfile} disabled={!adultConfirmed || username.length < 3 || !broadArea || !birthDate || interests.length === 0 || authBusy}>{authBusy ? "Saving…" : "Submit for verification"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<small className="modal-foot">Your birth date is private and is never placed on your dating profile.</small></>}
        </> : <>
          <div className={`modal-avatar ${selected?.tone}`}>{selected?.initials}</div><p className="eyebrow">SAY HELLO TO {selected?.name.toUpperCase()}</p><h2>{sent ? "Hello sent." : "Start like a person."}</h2>{sent ? <p>Your introduction is waiting in their inbox. They can accept, politely pass, or report it—no awkward matching game.</p> : <><textarea defaultValue={`Your note about ${selected?.tags[1].toLowerCase()} caught my attention—what got you into it?`} aria-label="Introduction message"/><p className="character-note">Thoughtful introductions get thoughtful replies.</p><button className="primary full" onClick={() => setSent(true)}>Send introduction <span>→</span></button></>}
        </>}
      </div></div>}
    </main>
  );
}
