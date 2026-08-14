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

export default function Home() {
  const [verified, setVerified] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [modal, setModal] = useState<"verify" | "onboarding" | "hello" | null>(null);
  const [selected, setSelected] = useState<(typeof people)[number] | null>(null);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [hiddenPeople, setHiddenPeople] = useState<string[]>([]);
  const [draggingPerson, setDraggingPerson] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const refreshAccess = async (userId?: string) => {
      setSignedIn(Boolean(userId));
      if (!userId) { setVerified(false); setProfileReady(false); return; }
      const [{ data: account }, { data: profile }] = await Promise.all([
        supabase.from("accounts").select("state, verification, membership_active").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle(),
      ]);
      setProfileReady(Boolean(profile));
      setVerified(account?.state === "active" && account.verification === "verified" && account.membership_active === true);
      setModal(profile ? null : "onboarding");
    };
    supabase.auth.getSession().then(({ data }) => refreshAccess(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => void refreshAccess(session?.user.id), 0));
    return () => data.subscription.unsubscribe();
  }, []);

  const enter = () => setModal("verify");
  const sendSignInLink = async () => {
    if (!supabase || !email) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
    setAuthBusy(false);
    setAuthMessage(error ? error.message : "Check your email for a secure sign-in link.");
  };
  const saveProfile = async () => {
    if (!supabase || !adultConfirmed || !username) return;
    setAuthBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { error } = userId ? await supabase.from("profiles").upsert({ user_id: userId, username }) : { error: new Error("Please sign in again.") };
    setAuthBusy(false);
    if (error) return setAuthMessage(error.message);
    setProfileReady(true); setAuthMessage(""); setModal(null);
  };
  const signOut = async () => { await supabase?.auth.signOut(); setModal(null); };
  const hideDraggedPerson = () => {
    if (!draggingPerson) return;
    setHiddenPeople(current => [...current, draggingPerson]);
    setDraggingPerson(null);
  };
  const hello = (person: (typeof people)[number]) => { setSelected(person); setSent(false); setModal("hello"); };

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

      <section className="room-section" id="room">
        <div className="section-heading"><div><p className="eyebrow">THE ROOM</p><h2>Everyone here is open to meeting.</h2></div><div className="filters"><button className="active-filter">Nearby</button><button>Online recently</button><button>Long-term</button></div></div>
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
          <div className="room-center"><span>THE LOCAL ROOM</span><strong>{people.filter(person => person.online && !hiddenPeople.includes(person.name)).length} here now</strong><small>Move around. Notice someone. Say hello.</small></div>
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
          <div className="modal-mark">✓</div><p className="eyebrow">PRIVATE SIGN-IN</p><h2>Come on in.</h2><p>Enter your email for a secure sign-in link. Your email and legal identity are never shown on your dating profile.</p>
          <div className="verify-list"><span><b>1</b> Create your private account</span><span><b>2</b> Confirm you’re 18+</span><span><b>3</b> Choose a username</span></div>
          <input className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-label="Email address" />
          <button className="primary full" onClick={sendSignInLink} disabled={!email || authBusy || !isSupabaseConfigured}>{authBusy ? "Sending…" : "Email me a sign-in link"} <span>→</span></button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}<small className="modal-foot">Profile access still requires adult verification and active membership.</small>
        </> : modal === "onboarding" ? <>
          <div className="modal-mark">✓</div><p className="eyebrow">{profileReady ? "ACCOUNT CREATED" : "ONE LAST STEP"}</p><h2>{profileReady ? "You’re in." : "Choose your username."}</h2>
          {profileReady ? <><p>Your private account is ready. Identity verification and membership activation are the next steps before profiles become visible.</p><button className="primary full" onClick={() => setModal(null)}>Return to Meet Freely <span>→</span></button><button className="signout-button" onClick={signOut}>Sign out</button></> : <><p>This is the only name other members will see. Don’t use your surname or social handle.</p><input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24))} placeholder="Private username" aria-label="Private username" /><label className="adult-check"><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /> I confirm I am at least 18 years old.</label><button className="primary full" onClick={saveProfile} disabled={!adultConfirmed || username.length < 3 || authBusy}>{authBusy ? "Saving…" : "Create my account"} <span>→</span></button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}</>}
        </> : <>
          <div className={`modal-avatar ${selected?.tone}`}>{selected?.initials}</div><p className="eyebrow">SAY HELLO TO {selected?.name.toUpperCase()}</p><h2>{sent ? "Hello sent." : "Start like a person."}</h2>{sent ? <p>Your introduction is waiting in their inbox. They can accept, politely pass, or report it—no awkward matching game.</p> : <><textarea defaultValue={`Your note about ${selected?.tags[1].toLowerCase()} caught my attention—what got you into it?`} aria-label="Introduction message"/><p className="character-note">Thoughtful introductions get thoughtful replies.</p><button className="primary full" onClick={() => setSent(true)}>Send introduction <span>→</span></button></>}
        </>}
      </div></div>}
    </main>
  );
}
