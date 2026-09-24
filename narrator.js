/* ================= SHADOWS OF THE COURT — NARRATOR =================
   راوی مستقل از منطق بازی
   فقط تغییرات UI را مشاهده می‌کند و صدای مرورگر را پخش می‌کند.
======================================================================= */

(() => {
  "use strict";

  const state = {
    enabled: true,
    lastKey: "",
    speaking: false,
    timer: null
  };

  const lines = {
    intro:
      "شب بر دربار سایه افکنده است... هر یک از شما رازی در سینه دارد.",

    president:
      "صدر اعظم، زمان تصمیم فرا رسیده است. چه کسی را برای وزارت برمی‌گزینید؟",

    voting:
      "اهالی دربار، اکنون نوبت شماست. آیا این دولت را تأیید می‌کنید؟",

    approved:
      "دربار سخن گفت. دولت تشکیل شد.",

    rejected:
      "رأی دربار صادر شد... این دولت پذیرفته نشد.",

    presidentCards:
      "سه قانون در دست صدر اعظم است. یکی را کنار بگذارید.",

    ministerCards:
      "دو قانون به وزیر رسیده است. اکنون سرنوشت دربار در دستان شماست.",

    policy:
      "قانون جدید در دربار اجرا شد.",

    finished:
      "سرنوشت دربار مشخص شد. تاریخ، قضاوت خود را خواهد کرد."
  };

  /* ---------------------------------------------------------------
     ساخت پنل راوی
  ---------------------------------------------------------------- */

  function ensurePanel() {
    if (document.getElementById("narratorPanel")) return;

    const panel = document.createElement("aside");

    panel.id = "narratorPanel";
    panel.className = "narrator-panel";

    panel.innerHTML = `
      <div class="narrator-avatar">🎙️</div>

      <div class="narrator-body">
        <div class="narrator-name">
          راوی دربار
        </div>

        <div id="narratorText" class="narrator-text">
          ...
        </div>
      </div>

      <button
        id="narratorToggle"
        class="narrator-toggle"
        type="button"
        title="روشن / خاموش کردن راوی"
      >
        🔊
      </button>
    `;

    document.body.appendChild(panel);

    const toggle = document.getElementById("narratorToggle");

    if (toggle) {
      toggle.addEventListener("click", () => {
        state.enabled = !state.enabled;

        toggle.textContent = state.enabled ? "🔊" : "🔇";

        toggle.classList.toggle(
          "muted",
          !state.enabled
        );

        if (
          !state.enabled &&
          "speechSynthesis" in window
        ) {
          window.speechSynthesis.cancel();
        }
      });
    }
  }

  /* ---------------------------------------------------------------
     پخش صدای راوی
  ---------------------------------------------------------------- */

  function speak(text, key) {
    if (!text) return;

    /*
      جلوگیری از تکرار یک دیالوگ
    */
    if (key === state.lastKey) return;

    state.lastKey = key;

    ensurePanel();

    const panel =
      document.getElementById("narratorPanel");

    const textElement =
      document.getElementById("narratorText");

    if (!panel || !textElement) return;

    textElement.textContent = text;

    panel.classList.add("show");

    clearTimeout(state.timer);

    state.timer = setTimeout(() => {
      panel.classList.remove("show");
    }, 7500);

    /*
      اگر راوی خاموش باشد فقط متن نمایش داده می‌شود.
    */
    if (
      !state.enabled ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(text);

    utterance.lang = "fa-IR";
    utterance.rate = 0.88;
    utterance.pitch = 0.82;
    utterance.volume = 1;

    /*
      پیدا کردن صدای فارسی در مرورگر
    */
    const voices =
      window.speechSynthesis.getVoices();

    const faVoice = voices.find((voice) =>
      /^fa(-|_)/i.test(voice.lang)
    );

    if (faVoice) {
      utterance.voice = faVoice;
    }

    state.speaking = true;

    utterance.onend = () => {
      state.speaking = false;
    };

    utterance.onerror = () => {
      state.speaking = false;
    };

    window.speechSynthesis.speak(utterance);
  }

  /* ---------------------------------------------------------------
     گرفتن متن یک عنصر
  ---------------------------------------------------------------- */

  function textOf(id) {
    const element =
      document.getElementById(id);

    return element
      ? element.textContent.trim()
      : "";
  }

  /* ---------------------------------------------------------------
     تشخیص مرحله بازی
  ---------------------------------------------------------------- */

  function detect() {
    const gameScreen =
      document.getElementById("gameScreen");

    /*
      اگر صفحه بازی باز نیست، کاری نکن.
    */
    if (
      !gameScreen ||
      gameScreen.classList.contains("hidden")
    ) {
      return;
    }

    const status =
      textOf("gameStatus");

    const instruction =
      textOf("gameInstruction");

    const result =
      textOf("resultTitle");

    const winner =
      textOf("winnerTitle");

    /* -----------------------------------------------------------
       پایان بازی
    ------------------------------------------------------------ */

    const finishOverlay =
      document.getElementById("finishOverlay");

    if (
      winner &&
      finishOverlay &&
      !finishOverlay.classList.contains("hidden")
    ) {
      speak(
        lines.finished,
        "finished"
      );

      return;
    }

    /* -----------------------------------------------------------
       نتیجه قانون
    ------------------------------------------------------------ */

    if (result) {
      speak(
        result.includes("مشروطه") ||
        result.includes("قاجاری")
          ? `${result}. ${lines.policy}`
          : lines.policy,
        "policy-" + result
      );

      return;
    }

    /* -----------------------------------------------------------
       پنل انتخاب قانون توسط صدر اعظم
    ------------------------------------------------------------ */

    const presidentPanel =
      document.getElementById(
        "presidentPolicyPanel"
      );

    if (
      presidentPanel &&
      !presidentPanel.classList.contains("hidden")
    ) {
      speak(
        lines.presidentCards,
        "president-cards"
      );

      return;
    }

    /* -----------------------------------------------------------
       پنل انتخاب قانون توسط وزیر
    ------------------------------------------------------------ */

    const ministerPanel =
      document.getElementById(
        "ministerPolicyPanel"
      );

    if (
      ministerPanel &&
      !ministerPanel.classList.contains("hidden")
    ) {
      speak(
        lines.ministerCards,
        "minister-cards"
      );

      return;
    }

    /* -----------------------------------------------------------
       پنل رأی‌گیری
    ------------------------------------------------------------ */

    const votePanel =
      document.getElementById("votePanel");

    if (
      votePanel &&
      !votePanel.classList.contains("hidden")
    ) {
      speak(
        lines.voting,
        "voting"
      );

      return;
    }

    /* -----------------------------------------------------------
       انتخاب وزیر توسط صدر اعظم
    ------------------------------------------------------------ */

    const ministerSelection =
      document.getElementById(
        "ministerSelection"
      );

    if (
      ministerSelection &&
      !ministerSelection.classList.contains("hidden")
    ) {
      speak(
        lines.president,
        "president"
      );

      return;
    }

    /* -----------------------------------------------------------
       نتیجه رأی دولت
    ------------------------------------------------------------ */

    if (status.includes("دولت تأیید شد")) {
      speak(
        lines.approved,
        "approved"
      );

      return;
    }

    if (status.includes("دولت رد شد")) {
      speak(
        lines.rejected,
        "rejected"
      );

      return;
    }

    /*
      استفاده از instruction برای بعضی نسخه‌های UI
    */
    if (instruction) {
      const lowerInstruction =
        instruction.toLowerCase();

      if (
        lowerInstruction.includes("رأی") ||
        lowerInstruction.includes("vote")
      ) {
        speak(
          lines.voting,
          "instruction-voting"
        );

        return;
      }
    }
  }

  /* ---------------------------------------------------------------
     راه‌اندازی
  ---------------------------------------------------------------- */

  function boot() {
    ensurePanel();

    /*
      مشاهده تغییرات صفحه بدون دست زدن به game.js
    */

    const observer =
      new MutationObserver(() => {
        clearTimeout(boot._debounce);

        boot._debounce = setTimeout(
          detect,
          120
        );
      });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    /*
      اولین تعامل کاربر باعث فعال شدن صدای راوی می‌شود.
      این کار برای محدودیت autoplay مرورگرهاست.
    */

    document.addEventListener(
      "click",
      () => {
        const gameScreen =
          document.getElementById(
            "gameScreen"
          );

        if (
          gameScreen &&
          !gameScreen.classList.contains("hidden")
        ) {
          if (!state.lastKey) {
            speak(
              lines.intro,
              "intro"
            );
          }

          detect();
        }
      },
      {
        passive: true
      }
    );

    detect();
  }

  /* ---------------------------------------------------------------
     شروع پس از آماده شدن صفحه
  ---------------------------------------------------------------- */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot
    );
  } else {
    boot();
  }

  /* ---------------------------------------------------------------
     API اختیاری برای استفاده دستی
  ---------------------------------------------------------------- */

  window.CourtNarrator = {
    say: (
      text,
      key = "manual-" + text
    ) => {
      speak(text, key);
    },

    mute: () => {
      state.enabled = false;

      if (
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
      }

      const button =
        document.getElementById(
          "narratorToggle"
        );

      if (button) {
        button.textContent = "🔇";
        button.classList.add("muted");
      }
    },

    unmute: () => {
      state.enabled = true;

      const button =
        document.getElementById(
          "narratorToggle"
        );

      if (button) {
        button.textContent = "🔊";
        button.classList.remove("muted");
      }
    }
  };
})();