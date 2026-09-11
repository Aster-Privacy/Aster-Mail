cask "aster-mail" do
  version "@VERSION@"
  sha256 "@SHA256@"

  url "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v#{version}/Aster-Mail-universal.dmg",
      verified: "github.com/Aster-Privacy/Aster-Mail/"
  name "Aster Mail"
  desc "End-to-end encrypted email client"
  homepage "https://astermail.org/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :catalina"

  app "Aster Mail.app"

  zap trash: [
    "~/Library/Application Support/com.astermail.mail",
    "~/Library/Caches/aster-mail-desktop",
    "~/Library/Caches/com.astermail.mail",
    "~/Library/Preferences/com.astermail.mail.plist",
    "~/Library/Saved Application State/com.astermail.mail.savedState",
    "~/Library/WebKit/aster-mail-desktop",
    "~/Library/WebKit/com.astermail.mail",
  ]
end
