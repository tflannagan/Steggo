document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById("dropZone");
  const imagePreview = document.getElementById("imagePreview");
  const messageInput = document.getElementById("message");
  const fileInput = document.getElementById("fileInput");
  const encodeBtn = document.getElementById("encodeBtn");
  const decodeBtn = document.getElementById("decodeBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const passwordInput = document.getElementById("password");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const modal = document.getElementById("modal");
  const modalContent = document.getElementById("modalContent");
  const closeModal = document.getElementById("closeModal");

  let image = null;

  function showModal(message) {
    modalContent.textContent = message;
    modal.style.display = "flex";
  }

  closeModal.onclick = () => {
    modal.style.display = "none";
  };

  window.onclick = (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    handleFiles(e.dataTransfer.files);
  });

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  function handleFiles(files) {
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          image = new Image();
          image.onload = () => {
            imagePreview.src = image.src;
            imagePreview.style.display = "block";
            dropZone.classList.add("has-image");
          };
          image.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    }
  }

  async function encryptMessage(message, password) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(message)
    );
    return {
      salt: Array.from(salt),
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    };
  }

  async function decryptMessage(encryptedData, password) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new Uint8Array(encryptedData.salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encryptedData.iv) },
      key,
      new Uint8Array(encryptedData.data)
    );
    return new TextDecoder().decode(decrypted);
  }

  encodeBtn.addEventListener("click", async () => {
    if (!image || !messageInput.value || !passwordInput.value) {
      showModal("Please provide an image, message, and password.");
      return;
    }

    try {
      const encryptedMessage = await encryptMessage(
        messageInput.value,
        passwordInput.value
      );
      const messageToEmbed = JSON.stringify(encryptedMessage);

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      if (messageToEmbed.length * 8 > data.length / 4) {
        showModal("Message is too long for this image.");
        return;
      }

      for (let i = 0; i < messageToEmbed.length; i++) {
        const charCode = messageToEmbed.charCodeAt(i);
        for (let j = 0; j < 8; j++) {
          const bit = (charCode >> j) & 1;
          data[i * 32 + j * 4] = (data[i * 32 + j * 4] & 254) | bit;
        }
      }

      for (let j = 0; j < 8; j++) {
        data[messageToEmbed.length * 32 + j * 4] =
          data[messageToEmbed.length * 32 + j * 4] & 254;
      }

      ctx.putImageData(imageData, 0, 0);
      imagePreview.src = canvas.toDataURL("image/png");
      showModal("Message encoded successfully!");
    } catch (error) {
      showModal("Error encoding message: " + error.message);
    }
  });

  decodeBtn.addEventListener("click", async () => {
    if (!image || !passwordInput.value) {
      showModal("Please provide an image and password.");
      return;
    }

    try {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let encodedMessage = "";
      let charCode = 0;
      let bitCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const bit = data[i] & 1;
        charCode |= bit << bitCount;
        bitCount++;

        if (bitCount === 8) {
          if (charCode === 0) break;
          encodedMessage += String.fromCharCode(charCode);
          charCode = 0;
          bitCount = 0;
        }
      }

      const encryptedData = JSON.parse(encodedMessage);
      const decryptedMessage = await decryptMessage(
        encryptedData,
        passwordInput.value
      );
      messageInput.value = decryptedMessage;
      showModal("Message decoded successfully!");
    } catch (error) {
      showModal(
        "Failed to decode message. Please check the password and try again."
      );
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!image) {
      showModal("Please encode a message first.");
      return;
    }

    const link = document.createElement("a");
    link.download = `Stego_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
});
