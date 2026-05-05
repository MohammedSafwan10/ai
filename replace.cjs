const fs = require("fs");
["src/App.tsx", "src/components/ChatMessage.tsx", "src/components/TypingIndicator.tsx", "package.json", "index.html"].forEach(f => {
  if (fs.existsSync(f)) {
    let data = fs.readFileSync(f, "utf8");
    data = data.replace(/--nexus-/g, "--privora-")
               .replace(/Nexus/g, "Privora")
               .replace(/nexus-chats/g, "privora-chats");
    fs.writeFileSync(f, data);
    console.log("Updated " + f);
  }
});
