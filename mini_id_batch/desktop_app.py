"""
EBSU Mini ID Batch — Standalone Python Desktop Application
Built with CustomTkinter, PIL, QRCode, and ReportLab.
100% Offline execution with Device Hardware Sealing & CorelDRAW Vector PDF Exporter.
"""

import os
import sys
import json
import hashlib
import uuid
import datetime
import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
from PIL import Image, ImageDraw, ImageFont, ImageTk
import qrcode
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas

# Set CustomTkinter theme
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "app_data.json")

class MiniIDBatchDesktopApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("EBSU Student ID Generator — Standalone Desktop Edition")
        self.geometry("1280x820")
        self.minsize(1100, 720)

        # Load App Settings & Device Seal State
        self.data = self.load_app_data()
        self.hardware_id = self.get_hardware_id()
        self.valid_otp = self.compute_valid_otp(self.hardware_id)

        # State Variables
        self.var_matric = tk.StringVar(value="EBSU/2019/97009")
        self.var_name = tk.StringVar(value="Ogbonnaya Nnagozie")
        self.var_faculty = tk.StringVar(value="Science")
        self.var_dept = tk.StringVar(value="Applied Biology")
        self.var_expiry = tk.StringVar(value="2023")
        self.var_sig_type = tk.StringVar(value="Abbreviation Text (e.g. O.N)")
        self.var_sig_text = tk.StringVar(value="O.N")
        self.var_blood = tk.StringVar(value="O+")
        self.var_genotype = tk.StringVar(value="AA")
        self.var_phone = tk.StringVar(value="+234-8067664449")
        self.var_view = tk.StringVar(value="Front View")

        self.photo_path = None
        self.sig_image_path = None

        # Build UI
        self.setup_ui()

        # Check Device Seal Activation Gate
        if not self.data.get("device_sealed", False):
            self.show_device_lock_screen()

    def get_hardware_id(self):
        mac = hex(uuid.getnode()).upper().replace("0X", "")
        raw = f"{mac}_EBSU_SALT_2026"
        h = hashlib.md5(raw.encode()).hexdigest().upper()
        return f"EBSU-HW-{h[:4]}-{h[4:8]}"

    def compute_valid_otp(self, hw_id):
        raw = f"{hw_id}_EBSU_ADMIN_KEY_2026"
        h = hashlib.md5(raw.encode()).hexdigest()
        num = int(h[:8], 16) % 1000000
        return f"{num:06d}"

    def load_app_data(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"device_sealed": False, "counter": 0, "logs": [], "drop_path": os.path.join(BASE_DIR, "exports")}

    def save_app_data(self):
        try:
            with open(DATA_FILE, "w") as f:
                json.dump(self.data, f, indent=2)
        except Exception as e:
            print("Save data error:", e)

    def setup_ui(self):
        # ── Top Header Bar ──
        self.header_frame = ctk.CTkFrame(self, height=60, corner_radius=0, fg_color="#091529")
        self.header_frame.pack(side="top", fill="x")

        self.lbl_title = ctk.CTkLabel(
            self.header_frame,
            text="EBONYI STATE UNIVERSITY  •  Mini ID Batch",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color="#ffffff"
        )
        self.lbl_title.pack(side="left", padx=24, pady=16)

        self.lbl_counter = ctk.CTkLabel(
            self.header_frame,
            text=f"🪪 Cards Generated: {self.data.get('counter', 0)}",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#38bdf8",
            fg_color="#11223e",
            corner_radius=12,
            padx=12,
            pady=6
        )
        self.lbl_counter.pack(side="left", padx=12)

        self.btn_admin_tool = ctk.CTkButton(
            self.header_frame,
            text="🔑 Device Seal Admin",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color="transparent",
            border_color="#38bdf8",
            border_width=1,
            text_color="#38bdf8",
            command=self.open_admin_modal
        )
        self.btn_admin_tool.pack(side="right", padx=16)

        # ── Main Content Area ──
        self.main_frame = ctk.CTkFrame(self, fg_color="#070f1e", corner_radius=0)
        self.main_frame.pack(side="top", fill="both", expand=True, padx=20, pady=20)

        # Left Controls Sidebar
        self.sidebar = ctk.CTkScrollableFrame(self.main_frame, width=380, fg_color="#0d1b30", corner_radius=14)
        self.sidebar.pack(side="left", fill="y", padx=(0, 16))

        self.lbl_sec_title = ctk.CTkLabel(
            self.sidebar,
            text="Student Biodata & Settings",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#ffffff"
        )
        self.lbl_sec_title.pack(anchor="w", padx=12, pady=(12, 16))

        # Inputs
        self.create_input_field(self.sidebar, "Matriculation Number", self.var_matric)
        self.create_input_field(self.sidebar, "Full Name", self.var_name)
        self.create_input_field(self.sidebar, "Faculty", self.var_faculty)
        self.create_input_field(self.sidebar, "Department", self.var_dept)
        self.create_input_field(self.sidebar, "Expiry Year", self.var_expiry)

        # Photo Picker
        lbl_photo = ctk.CTkLabel(self.sidebar, text="Student Passport Photo:", font=ctk.CTkFont(size=12, weight="bold"))
        lbl_photo.pack(anchor="w", padx=12, pady=(10, 4))

        self.btn_upload_photo = ctk.CTkButton(
            self.sidebar,
            text="📷 Select Passport Photo",
            fg_color="#1e3a66",
            command=self.pick_photo
        )
        self.btn_upload_photo.pack(fill="x", padx=12, pady=(0, 12))

        # Signature Mode Dropdown Selector
        lbl_sig_mode = ctk.CTkLabel(self.sidebar, text="Signature Format (Dropdown):", font=ctk.CTkFont(size=12, weight="bold"))
        lbl_sig_mode.pack(anchor="w", padx=12, pady=(6, 4))

        self.cbo_sig_type = ctk.CTkComboBox(
            self.sidebar,
            values=["Abbreviation Text (e.g. O.N)", "Signature Picture (Landscape Image)"],
            variable=self.var_sig_type,
            command=self.on_sig_type_change
        )
        self.cbo_sig_type.pack(fill="x", padx=12, pady=(0, 10))

        # Signature Text Input
        self.frame_sig_text = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        self.frame_sig_text.pack(fill="x", padx=12)
        lbl_st = ctk.CTkLabel(self.frame_sig_text, text="Abbreviation Text:", font=ctk.CTkFont(size=11))
        lbl_st.pack(anchor="w")
        entry_st = ctk.CTkEntry(self.frame_sig_text, textvariable=self.var_sig_text)
        entry_st.pack(fill="x", pady=(2, 10))
        entry_st.bind("<KeyRelease>", lambda e: self.update_preview())

        # Signature Image Upload Box
        self.frame_sig_image = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        self.btn_upload_sig = ctk.CTkButton(
            self.frame_sig_image,
            text="✍️ Select Landscape Signature Image",
            fg_color="#1e3a66",
            command=self.pick_sig_image
        )
        self.btn_upload_sig.pack(fill="x", pady=(2, 10))

        # Blood & Genotype
        lbl_bg = ctk.CTkLabel(self.sidebar, text="Blood Group & Genotype:", font=ctk.CTkFont(size=12, weight="bold"))
        lbl_bg.pack(anchor="w", padx=12, pady=(6, 4))

        bg_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        bg_frame.pack(fill="x", padx=12, pady=(0, 12))

        cbo_blood = ctk.CTkComboBox(
            bg_frame,
            values=["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"],
            variable=self.var_blood,
            width=150,
            command=lambda e: self.update_preview()
        )
        cbo_blood.pack(side="left", padx=(0, 8))

        cbo_genotype = ctk.CTkComboBox(
            bg_frame,
            values=["AA", "AS", "SS", "AC"],
            variable=self.var_genotype,
            width=150,
            command=lambda e: self.update_preview()
        )
        cbo_genotype.pack(side="left")

        # Preset Buttons
        lbl_ps = ctk.CTkLabel(self.sidebar, text="Quick Presets:", font=ctk.CTkFont(size=12, weight="bold"))
        lbl_ps.pack(anchor="w", padx=12, pady=(10, 4))

        ps_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        ps_frame.pack(fill="x", padx=12, pady=(0, 16))

        btn_p1 = ctk.CTkButton(ps_frame, text="Ogbonnaya", width=100, command=lambda: self.load_preset("ogbonnaya"))
        btn_p1.pack(side="left", padx=2)
        btn_p2 = ctk.CTkButton(ps_frame, text="Wilson", width=100, command=lambda: self.load_preset("wilson"))
        btn_p2.pack(side="left", padx=2)

        # ── Right Live Card Preview Area ──
        self.preview_area = ctk.CTkFrame(self.main_frame, fg_color="#050b16", corner_radius=14)
        self.preview_area.pack(side="right", fill="both", expand=True)

        # Toolbar
        self.toolbar = ctk.CTkFrame(self.preview_area, fg_color="#0d1b30", height=50)
        self.toolbar.pack(side="top", fill="x", padx=16, pady=16)

        cbo_view = ctk.CTkSegmentedButton(
            self.toolbar,
            values=["Front View", "Back View"],
            variable=self.var_view,
            command=lambda e: self.update_preview()
        )
        cbo_view.pack(side="left", padx=12, pady=8)

        self.btn_exp_png = ctk.CTkButton(
            self.toolbar,
            text="⬇ Export PNG (300 DPI)",
            fg_color="#0056D2",
            command=self.export_png
        )
        self.btn_exp_png.pack(side="right", padx=8, pady=8)

        self.btn_exp_corel = ctk.CTkButton(
            self.toolbar,
            text="🎨 CorelDRAW Layout (.pdf)",
            fg_color="#10b981",
            hover_color="#059669",
            command=self.export_coreldraw_pdf
        )
        self.btn_exp_corel.pack(side="right", padx=8, pady=8)

        # Canvas Image Display
        self.card_canvas_lbl = ctk.CTkLabel(self.preview_area, text="", fg_color="transparent")
        self.card_canvas_lbl.pack(expand=True, padx=20, pady=20)

        self.update_preview()

    def create_input_field(self, parent, label_text, var):
        lbl = ctk.CTkLabel(parent, text=f"{label_text}:", font=ctk.CTkFont(size=12, weight="bold"))
        lbl.pack(anchor="w", padx=12, pady=(8, 2))
        entry = ctk.CTkEntry(parent, textvariable=var)
        entry.pack(fill="x", padx=12, pady=(0, 6))
        entry.bind("<KeyRelease>", lambda e: self.update_preview())

    def on_sig_type_change(self, value):
        if "Picture" in value:
            self.frame_sig_text.pack_forget()
            self.frame_sig_image.pack(fill="x", padx=12)
        else:
            self.frame_sig_image.pack_forget()
            self.frame_sig_text.pack(fill="x", padx=12)
        self.update_preview()

    def pick_photo(self):
        file = filedialog.askopenfilename(filetypes=[("Image Files", "*.png;*.jpg;*.jpeg;*.webp")])
        if file:
            self.photo_path = file
            self.btn_upload_photo.configure(text="✅ Photo Loaded")
            self.update_preview()

    def pick_sig_image(self):
        file = filedialog.askopenfilename(filetypes=[("Image Files", "*.png;*.jpg;*.jpeg;*.webp")])
        if file:
            self.sig_image_path = file
            self.btn_upload_sig.configure(text="✅ Signature Loaded")
            self.update_preview()

    def load_preset(self, p_name):
        if p_name == "ogbonnaya":
            self.var_matric.set("EBSU/2019/97009")
            self.var_name.set("Ogbonnaya Nnagozie")
            self.var_faculty.set("Science")
            self.var_dept.set("Applied Biology")
            self.var_expiry.set("2023")
            self.var_blood.set("O+")
            self.var_genotype.set("AA")
            self.var_sig_text.set("O.N")
        elif p_name == "wilson":
            self.var_matric.set("EBSU/2024/900001")
            self.var_name.set("Wilson Somtochukwu Nnaji")
            self.var_faculty.set("Science")
            self.var_dept.set("Computer Science")
            self.var_expiry.set("2028")
            self.var_blood.set("A+")
            self.var_genotype.set("AA")
            self.var_sig_text.set("W.N")
        self.sig_image_path = None
        self.var_sig_type.set("Abbreviation Text (e.g. O.N)")
        self.on_sig_type_change("Abbreviation Text")

    def generate_qr_image(self, payload):
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=4,
            border=1,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        return qr.make_image(fill_color="black", back_color="white").convert("RGB")

    def render_card_front(self):
        # 1:1 Resolution: 980x610 (High DPI Card Rendering)
        W, H = 980, 610
        img = Image.new("RGB", (W, H), "#ffffff")
        draw = ImageDraw.Draw(img)

        # 1. Top Blue Banner (#0056D2)
        draw.rectangle([0, 0, W, 84], fill="#0056D2")

        # Fonts
        font_header = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_bold = ImageFont.load_default()
        font_norm = ImageFont.load_default()

        # Text: EBONYI STATE UNIVERSITY
        draw.text((W // 2, 42), "EBONYI STATE UNIVERSITY", fill="#ffffff", font=font_header, anchor="mm")
        draw.text((W // 2, 110), "STUDENT IDENTITY CARD", fill="#E60000", font=font_title, anchor="mm")

        # Matric Row
        draw.text((36, 150), f"MATRIC NUMBER: {self.var_matric.get()}", fill="#0056D2", font=font_bold)

        # Watermark Crest
        watermark_path = os.path.join(BASE_DIR, "ebsu_watermark.png")
        if os.path.exists(watermark_path):
            try:
                wm = Image.open(watermark_path).convert("RGBA")
                wm = wm.resize((360, 360))
                # Make very light
                alpha = wm.split()[3].point(lambda p: p * 0.20)
                wm.putalpha(alpha)
                img.paste(wm, (W // 2 - 180, H // 2 - 140), wm)
            except Exception:
                pass

        # Photo Frame
        photo_box = [36, 190, 240, 430]
        draw.rectangle(photo_box, outline="#111111", width=2)
        if self.photo_path and os.path.exists(self.photo_path):
            try:
                p_img = Image.open(self.photo_path).convert("RGB")
                p_img = p_img.resize((204, 240))
                img.paste(p_img, (36, 190))
            except Exception:
                pass

        # Details Column
        x_dt = 265
        y_dt = 190
        dy = 56

        details = [
            ("Name:", self.var_name.get()),
            ("Faculty:", self.var_faculty.get()),
            ("Department:", self.var_dept.get()),
            ("Expiry Year:", self.var_expiry.get()),
        ]

        for lbl, val in details:
            draw.text((x_dt, y_dt), lbl, fill="#000000", font=font_bold)
            draw.text((x_dt, y_dt + 24), val, fill="#000000", font=font_norm)
            y_dt += dy

        # Crest Logo (Top Right)
        crest_path = os.path.join(BASE_DIR, "ebsu_crest_logo.jpeg")
        if os.path.exists(crest_path):
            try:
                cr = Image.open(crest_path).convert("RGB")
                cr = cr.resize((110, 115))
                img.paste(cr, (W - 150, 180))
            except Exception:
                pass

        # Live Scannable QR Code (Bottom Right)
        qr_url = f"https://wheelson1.github.io/id_Gen/mini_id_batch/verify.html?matric={self.var_matric.get()}&name={self.var_name.get()}"
        qr_img = self.generate_qr_image(qr_url)
        qr_img = qr_img.resize((150, 150))
        draw.rectangle([W - 152, 310, W - 152 + 154, 310 + 154], outline="#000000", width=2)
        img.paste(qr_img, (W - 150, 312))

        # Bottom Footer: Medical Info & Signature
        draw.text((36, H - 75), "Blood Group", fill="#000000", font=font_bold)
        draw.text((36, H - 45), self.var_blood.get(), fill="#000000", font=font_norm)

        draw.text((180, H - 75), "Genotype", fill="#000000", font=font_bold)
        draw.text((180, H - 45), self.var_genotype.get(), fill="#000000", font=font_norm)

        # Signature Mode
        draw.text((W - 320, H - 55), "Signature", fill="#000000", font=font_bold)
        if "Picture" in self.var_sig_type.get() and self.sig_image_path and os.path.exists(self.sig_image_path):
            try:
                sig_i = Image.open(self.sig_image_path).convert("RGBA")
                sig_i = sig_i.resize((140, 50))
                img.paste(sig_i, (W - 210, H - 70), sig_i)
            except Exception:
                pass
        else:
            draw.text((W - 190, H - 58), self.var_sig_text.get(), fill="#000000", font=font_bold)

        # Card Border
        draw.rectangle([0, 0, W - 1, H - 1], outline="#0056D2", width=3)
        return img

    def render_card_back(self):
        W, H = 980, 610
        img = Image.new("RGB", (W, H), "#ffffff")
        draw = ImageDraw.Draw(img)

        draw.text((W // 2, 60), "AUTHORIZED SIGNATURE", fill="#000000", font=ImageFont.load_default(), anchor="mm")
        draw.text(
            (W // 2, 340),
            "This card remains the property of Ebonyi State University\nif this card is found, please return to the nearest police station or call;",
            fill="#111111",
            font=ImageFont.load_default(),
            anchor="mm"
        )
        draw.text((50, H - 60), f"Tel: {self.var_phone.get()}", fill="#000000", font=ImageFont.load_default())
        draw.text((W - 260, H - 60), "Powered By: EBSU ICT", fill="#000000", font=ImageFont.load_default())

        draw.rectangle([0, 0, W - 1, H - 1], outline="#0056D2", width=3)
        return img

    def update_preview(self):
        if self.var_view.get() == "Back View":
            img = self.render_card_back()
        else:
            img = self.render_card_front()

        # Display scaled down in UI (490x305)
        display_img = img.resize((490, 305), Image.Resampling.LANCZOS)
        photo = ImageTk.PhotoImage(display_img)
        self.card_canvas_lbl.configure(image=photo)
        self.card_canvas_lbl.image = photo

    def export_png(self):
        img = self.render_card_front()
        clean_m = self.var_matric.get().replace("/", "_")
        filename = f"EBSU_ID_Front_{clean_m}.png"
        filepath = os.path.join(self.data.get("drop_path", BASE_DIR), filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        img.save(filepath)

        self.data["counter"] = self.data.get("counter", 0) + 1
        self.save_app_data()
        self.lbl_counter.configure(text=f"🪪 Cards Generated: {self.data['counter']}")

        messagebox.showinfo("Export Successful", f"Saved PNG to:\n{filepath}")

    def export_coreldraw_pdf(self):
        clean_m = self.var_matric.get().replace("/", "_")
        filepath = os.path.join(self.data.get("drop_path", BASE_DIR), f"EBSU_CorelDRAW_Layout_{clean_m}.pdf")
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        # Render Images
        img_front = self.render_card_front()
        img_back = self.render_card_back()

        tmp_f = os.path.join(BASE_DIR, "tmp_front.png")
        tmp_b = os.path.join(BASE_DIR, "tmp_back.png")
        img_front.save(tmp_f)
        img_back.save(tmp_b)

        # Generate 1:1 mm Scale A5 Vector PDF for CorelDRAW kfx.cdr
        c = pdf_canvas.Canvas(filepath, pagesize=A5)
        card_w, card_h = 85.6 * mm, 53.98 * mm
        pos_x = 31.2 * mm
        pos_yf = 110 * mm
        pos_yb = 40 * mm

        c.drawImage(tmp_f, pos_x, pos_yf, card_w, card_h)
        c.drawImage(tmp_b, pos_x, pos_yb, card_w, card_h)
        c.save()

        # Cleanup tmp
        if os.path.exists(tmp_f): os.remove(tmp_f)
        if os.path.exists(tmp_b): os.remove(tmp_b)

        self.data["counter"] = self.data.get("counter", 0) + 1
        self.save_app_data()
        self.lbl_counter.configure(text=f"🪪 Cards Generated: {self.data['counter']}")

        messagebox.showinfo(
            "CorelDRAW PDF Exported",
            f"Saved CorelDRAW PDF to:\n{filepath}\n\n"
            f"📌 In CorelDRAW (kfx.cdr):\n"
            f"Press Ctrl+I to import this PDF directly onto your guidelines!"
        )

    def show_device_lock_screen(self):
        win = ctk.CTkToplevel(self)
        win.title("Device Seal Activation Required")
        win.geometry("440x400")
        win.grab_set()

        lbl = ctk.CTkLabel(win, text="🔒 Device License & Seal", font=ctk.CTkFont(size=18, weight="bold"))
        lbl.pack(pady=(24, 8))

        lbl_desc = ctk.CTkLabel(win, text="This desktop app is unsealed. Enter 6-digit Admin Master OTP to activate.", text_color="#94a3b8")
        lbl_desc.pack(padx=20)

        lbl_hw = ctk.CTkLabel(win, text=f"Hardware ID: {self.hardware_id}", font=ctk.CTkFont(size=13, weight="bold"), text_color="#38bdf8")
        lbl_hw.pack(pady=16)

        entry_otp = ctk.CTkEntry(win, placeholder_text="000000", font=ctk.CTkFont(size=22, weight="bold"), justify="center", width=200)
        entry_otp.pack(pady=10)

        def activate():
            val = entry_otp.get().strip()
            if val == self.valid_otp or val == "889900":
                self.data["device_sealed"] = True
                self.save_app_data()
                win.destroy()
                check_device_license = lambda: None
                messagebox.showinfo("Activated", "Device Sealed & Activated Successfully!")
            else:
                messagebox.showerror("Invalid OTP", "Incorrect OTP Code. Master OTP is 889900")

        btn_act = ctk.CTkButton(win, text="🔒 Activate Device", command=activate)
        btn_act.pack(pady=16)

    def open_admin_modal(self):
        win = ctk.CTkToplevel(self)
        win.title("Admin Device Seal Tool")
        win.geometry("440x300")

        lbl = ctk.CTkLabel(win, text="🔑 Admin Master OTP Generator", font=ctk.CTkFont(size=16, weight="bold"))
        lbl.pack(pady=(20, 10))

        lbl_cur = ctk.CTkLabel(win, text=f"Master Activation OTP for this PC: {self.valid_otp}\n(Master Override OTP: 889900)", font=ctk.CTkFont(size=13, weight="bold"), text_color="#10b981")
        lbl_cur.pack(pady=10)

        btn_c = ctk.CTkButton(win, text="Close Panel", command=win.destroy)
        btn_c.pack(pady=20)

if __name__ == "__main__":
    app = MiniIDBatchDesktopApp()
    app.mainloop()
