#!/usr/bin/env python3
"""Generate HR Profile Validation Checklist PDF"""

from fpdf import FPDF
from datetime import date

class HRChecklistPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 18)
        self.set_text_color(124, 58, 237)
        self.cell(0, 12, 'Pitch Perfect Solutions', new_x="LMARGIN", new_y="NEXT", align='C')
        self.set_font('Helvetica', 'B', 14)
        self.set_text_color(30, 30, 30)
        self.cell(0, 10, 'HR Profile Validation Checklist', new_x="LMARGIN", new_y="NEXT", align='C')
        self.set_font('Helvetica', '', 10)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, f'Generated: {date.today().strftime("%B %d, %Y")}', new_x="LMARGIN", new_y="NEXT", align='C')
        self.ln(4)
        self.set_draw_color(124, 58, 237)
        self.set_line_width(0.8)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

    def section_title(self, title, color=(124, 58, 237)):
        self.set_font('Helvetica', 'B', 13)
        self.set_text_color(*color)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(30, 30, 30)

    def section_subtitle(self, text):
        self.set_font('Helvetica', 'I', 9)
        self.set_text_color(100, 100, 100)
        self.multi_cell(0, 5, text)
        self.ln(2)
        self.set_text_color(30, 30, 30)

    def stat_box(self, label, value, color=(124, 58, 237)):
        x = self.get_x()
        y = self.get_y()
        self.set_fill_color(*color)
        self.set_text_color(255, 255, 255)
        self.set_font('Helvetica', 'B', 16)
        self.cell(40, 18, str(value), fill=True, align='C')
        self.set_xy(x, y + 18)
        self.set_font('Helvetica', '', 7)
        self.set_text_color(80, 80, 80)
        self.cell(40, 6, label, align='C')
        self.set_xy(x + 44, y)
        self.set_text_color(30, 30, 30)

    def table_header(self, cols, widths):
        self.set_font('Helvetica', 'B', 8)
        self.set_fill_color(124, 58, 237)
        self.set_text_color(255, 255, 255)
        for i, col in enumerate(cols):
            self.cell(widths[i], 7, col, border=1, fill=True, align='C')
        self.ln()
        self.set_text_color(30, 30, 30)

    def table_row(self, cells, widths, fill=False):
        self.set_font('Helvetica', '', 7.5)
        if fill:
            self.set_fill_color(245, 243, 255)
        max_h = 7
        x_start = self.get_x()
        y_start = self.get_y()
        if y_start + max_h > 270:
            self.add_page()
            y_start = self.get_y()
        for i, cell in enumerate(cells):
            self.set_xy(x_start + sum(widths[:i]), y_start)
            self.cell(widths[i], max_h, str(cell)[:55], border=1, fill=fill)
        self.ln(max_h)

    def checkbox_row(self, text, indent=0):
        self.set_font('ZapfDingbats', '', 10)
        y = self.get_y()
        if y + 7 > 270:
            self.add_page()
        self.cell(5 + indent, 6, 'o', align='C')  # empty checkbox
        self.set_font('Helvetica', '', 9)
        self.cell(0, 6, f'  {text}', new_x="LMARGIN", new_y="NEXT")


pdf = HRChecklistPDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# --- EXECUTIVE SUMMARY ---
pdf.set_font('Helvetica', '', 10)
pdf.set_text_color(60, 60, 60)
pdf.multi_cell(0, 5,
    'This checklist identifies every active employee with incomplete profile data. '
    'Each section lists specific individuals requiring HR action. '
    'Please work through each section and update the employee directory accordingly.')
pdf.ln(4)

# Stats row
pdf.set_font('Helvetica', 'B', 11)
pdf.set_text_color(124, 58, 237)
pdf.cell(0, 8, 'Profile Completion Overview (624 Active Employees)', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

x_start = pdf.get_x()
y_start = pdf.get_y()
pdf.stat_box('Missing Country', '83', color=(239, 68, 68))
pdf.stat_box('Missing Wage', '109', color=(239, 68, 68))
pdf.stat_box('Missing Slack', '72', color=(245, 158, 11))
pdf.stat_box('Name Issues', '17', color=(245, 158, 11))
pdf.set_xy(x_start, y_start + 28)
pdf.ln(4)

# ============================
# SECTION 1: NAME CLEANUP
# ============================
pdf.section_title('Section 1: Name Cleanup Required (17 Employees)', color=(239, 68, 68))
pdf.section_subtitle(
    'These employees have placeholder names, missing last names, username-style names, or '
    'clearly invalid entries. Please provide their real legal names.')

# 1A: Missing Last Name
pdf.set_font('Helvetica', 'B', 10)
pdf.set_text_color(60, 60, 60)
pdf.cell(0, 7, '1A. Missing Last Name (5)', new_x="LMARGIN", new_y="NEXT")

no_last = [
    ('1', 'Alethea', '', 'becreative@rogers.com', 'Provide last name + country + wage'),
    ('2', 'Justine', '', 'troyungab24@gmail.com', 'Provide last name + country + wage'),
    ('3', 'Maz', '', 'bbasmillion@gmail.com', 'Provide last name + country + wage'),
    ('4', 'missdi1', '', 'missdi1@gmail.com', 'Provide real name + country + wage'),
    ('5', 'octobersown1889', '', 'octobersown1889@gmail.com', 'Provide real name + country + wage'),
]
widths_1a = [8, 30, 60, 92]
pdf.table_header(['#', 'First Name', 'Email', 'Action Needed'], widths_1a)
for i, row in enumerate(no_last):
    pdf.table_row([row[0], row[1], row[3], row[4]], widths_1a, fill=i % 2 == 0)
pdf.ln(4)

# 1B: Placeholder Company Last Names
pdf.set_font('Helvetica', 'B', 10)
pdf.set_text_color(60, 60, 60)
pdf.cell(0, 7, '1B. Placeholder Last Names - Need Real Surnames (12)', new_x="LMARGIN", new_y="NEXT")

placeholder = [
    ('1', 'Alex Pitch Perfect', 'Agent', 'abershadsky@gmail.com', 'Provide real last name'),
    ('2', 'Jadbolja Pitch Perfect', 'Manager - Coach', 'jfrayadvisors@gmail.com', 'Provide real last name'),
    ('3', 'Sonia Pitch Perfect', 'Manager - Coach', 'soniabaldeo@hotmail.com', 'Provide real last name'),
    ('4', 'Tabby Pitch Perfect', 'Manager - Coach', 'tabark.ny@gmail.com', 'Provide real last name'),
    ('5', 'Arthur Pitch QA', 'QA', 'arthurshin23@gmail.com', 'Provide real last name'),
    ('6', 'Daniel Pitch QA', 'Head of QA', 'daniel.newqa@gmail.com', 'Provide real last name'),
    ('7', 'Ian Pitch QA', 'QA', 'nekomeice@gmail.com', 'Provide real last name'),
    ('8', 'Mason Pitch QA', 'QA', 'daler83280@gmail.com', 'Provide real last name'),
    ('9', 'Nash Pitch QA', 'Agent', 'nchernov025@gmail.com', 'Provide real last name'),
    ('10', 'Christy Pitch', 'Agent', 'christybrodeur70@gmail.com', 'Provide real last name'),
    ('11', 'Michael HR Assistant', 'Attendance Asst.', 'muradjon2025@outlook.com', 'Provide real last name'),
    ('12', 'Shawn HR Attendance Supervisor', 'HR Assistant', 'shohem08@gmail.com', 'Provide real last name'),
]
widths_1b = [8, 52, 30, 52, 48]
pdf.table_header(['#', 'Current Name', 'Role', 'Email', 'Action'], widths_1b)
for i, row in enumerate(placeholder):
    pdf.table_row(row, widths_1b, fill=i % 2 == 0)
pdf.ln(4)

# 1C: Suspicious Names
pdf.set_font('Helvetica', 'B', 10)
pdf.set_text_color(60, 60, 60)
pdf.cell(0, 7, '1C. Suspicious / Invalid Names - Verify Identity', new_x="LMARGIN", new_y="NEXT")
pdf.section_subtitle('These entries appear to be jokes, nicknames, or data errors. Confirm if active and provide real names.')

suspicious = [
    ('1', 'THE GRINCH', 'Agent', 'grinchmountain4lyfe@outlook.com', 'Verify identity + real name'),
    ('2', 'ArjuN MullicK TransfeR GoD..', 'Agent', 'mikemullick4444@gmail.com', 'Clean up name'),
]
widths_1c = [8, 52, 20, 62, 48]
pdf.table_header(['#', 'Current Name', 'Role', 'Email', 'Action'], widths_1c)
for i, row in enumerate(suspicious):
    pdf.table_row(row, widths_1c, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 2: MISSING BOTH COUNTRY & WAGE
# ============================
pdf.section_title('Section 2: Missing Country & Hourly Wage (57 Employees)')
pdf.section_subtitle(
    'These employees are active but have NEITHER country NOR hourly wage populated. '
    'They were not found in payroll records. Please confirm they are still active, '
    'and provide their country (Canada/USA) and hourly rate. '
    'Internal/system accounts and leadership are listed separately below.')

# Split into regular employees vs internal accounts
missing_both_regular = [
    ('1', 'Aya A', 'Manager - Coach', 'aya.alethari@gmail.com'),
    ('2', 'DeAnte A Maze', 'Agent', 'nolimitmaze17@gmail.com'),
    ('3', 'Hanan Abogamil (Demi)', 'Agent', 'demitemothy@gmail.com'),
    ('4', 'Leo-J Adriano', 'Agent', 'adrianoleoj@gmail.com'),
    ('5', 'Jorge Alvarado', 'Agent', 'Tony2002980@gmail.com'),
    ('6', 'Roy Aoun', 'Agent', 'royaoun55@gmail.com'),
    ('7', 'Melak Baban', 'Team Leader', 'melakbaban.kachour@outlook.com'),
    ('8', 'Victoria Bedford', 'Agent', 'vbedford93@gmail.com'),
    ('9', 'Yadasha Benjamin', 'Agent', 'Ybenjamin122@gmail.com'),
    ('10', 'John Betts', 'Agent', 'john@teamfym.com'),
    ('11', 'Katherine Borbon', 'Agent', 'borbonkatherine@rocketmail.com'),
    ('12', 'Tayshawna Bryce', 'Agent', 'Tayshawna.bryce@gmail.com'),
    ('13', 'Will Coatney', 'Agent', 'willcoatney@gmail.com'),
    ('14', 'Ester Cridlin', 'Agent', 'ester.cridlin@gmail.com'),
    ('15', 'D Dresha', 'Agent', 'd.dresha@yahoo.com'),
    ('16', 'Noga Elan', 'Agent', 'nogazappa@gmail.com'),
    ('17', 'Quinterria Floyd', 'Agent', 'quinterriafloyd94@gmail.com'),
    ('18', 'Gustavo Garcia', 'Agent', 'elmaildegustavo@post.com'),
    ('19', 'Tina Gilbert', 'Agent', 'tinagilbert729@gmail.com'),
    ('20', 'Richard Goltsman', 'Agent', 'ricky.goltsman@gmail.com'),
    ('21', 'Krisann Graham', 'Agent', 'Platinumdolls416@icloud.com'),
    ('22', 'Odian Green', 'Agent', 'odiangreen@gmail.com'),
    ('23', 'Therese Guerrero', 'Agent', 'theresa.guerrero@yahoo.com'),
    ('24', 'Lucia Harper', 'Agent', 'ldharper@rogers.com'),
    ('25', 'Kat Hartnett', 'Agent', 'dezzey2000@gmail.com'),
    ('26', 'Muhammad Khan', 'Agent', 'shahzorkhan03@gmail.com'),
    ('27', 'Shermin Koshy', 'Agent', 'shermin_koshy@icloud.com'),
    ('28', 'Scott Laforet', 'Agent', 'scottlfrt42@gmail.com'),
    ('29', 'Nicholas Lemon', 'Agent', 'nicholaslemon@rogers.com'),
    ('30', 'Melanie Lopez', 'Agent', 'melanie.pps@icloud.com'),
    ('31', 'Mike Lowry', 'Agent', 'mrdomond22@yahoo.com'),
    ('32', 'Diamond M.', 'Agent', 'missbeautiful2009@gmail.com'),
    ('33', 'Joanna Mae Singson', 'Agent', 'singsonjm56@gmail.com'),
    ('34', 'Myra Malagar', 'Agent', 'malagarmyra7@gmail.com'),
    ('35', 'Annesy May Tuballa', 'Agent', 'tuballaannesy@gmail.com'),
    ('36', 'Jahsiya Mullings', 'Agent', '03jahm@gmail.com'),
    ('37', 'Luis A Nieves Jr', 'Agent', 'nievestribe89@gmail.com'),
    ('38', 'Vivian Onyango', 'Agent', 'adhiambovivian879@gmail.com'),
    ('39', 'Cameran Porter', 'Agent', 'porter8801@gmail.com'),
    ('40', 'Vernon Prince Jr.', 'Agent', 'vprincejr@yahoo.com'),
    ('41', 'Josh Prodan', 'Manager - Coach', 'joshuaprodan@gmail.com'),
    ('42', 'Cynthia Renee', 'Agent', 'crp81066@yahoo.com'),
    ('43', 'Dave Roberts Davidson Elie', 'Agent', 'dconceptualist@gmail.com'),
    ('44', 'Jean Roi Sanchez', 'Agent', 'jeanroixx@gmail.com'),
    ('45', 'Mohamed Roumieh', 'Agent', 'mroumieh13@gmail.com'),
    ('46', 'Brian Shin', 'Agent', 'Shinbrian550@gmail.com'),
    ('47', 'Brad Sicat', 'Manager - Coach', 'bradsicat@gmail.com'),
    ('48', 'Richarnex Silfrat', 'Agent', 'richarnexs@gmail.com'),
    ('49', 'Tylo Su-Hackeett', 'Agent', 'tylo871@gmail.com'),
    ('50', 'Monica Thibou', 'Agent', 'm.thibou2@yahoo.com'),
    ('51', 'Monica Thurmond', 'Agent', 'jacemon2019@gmail.com'),
    ('52', 'Destiny Uwamenye', 'Agent', 'destinyuwamenye@yahoo.com'),
    ('53', 'Lucas Varela', 'Team Leader', 'codexfse@gmail.com'),
    ('54', 'Samuel Whatley', 'Agent', 'samuelwhatley9@gmail.com'),
    ('55', 'Courtney Wheeler', 'Agent', 'Bahamilove@icloud.com'),
    ('56', 'Vanessa Williams', 'Agent', 'vanessagreen837@gmail.com'),
    ('57', 'Cecile Wilson', 'Agent', 'cecilewilson@rogers.com'),
    ('58', 'Shawn Z', 'Agent', 'shawn@pitchperfectsolutions.net'),
    ('59', 'Nancy Zaidan', 'Agent', 'nancyhz2304@gmail.com'),
    ('60', 'Yanxi Zhang', 'Agent', 'zhangyanxi26@outlook.com'),
]
widths_2 = [8, 48, 30, 104]
pdf.table_header(['#', 'Name', 'Role', 'Email'], widths_2)
for i, row in enumerate(missing_both_regular):
    pdf.table_row(row, widths_2, fill=i % 2 == 0)
pdf.ln(3)

# Internal accounts missing data
pdf.set_font('Helvetica', 'B', 10)
pdf.set_text_color(100, 100, 100)
pdf.cell(0, 7, 'Also missing (Internal/Leadership - lower priority):', new_x="LMARGIN", new_y="NEXT")
pdf.set_font('Helvetica', '', 8)
pdf.set_text_color(120, 120, 120)
internal_names = [
    'Alex Bershadsky (President)', 'Boris Shvarts (Owner)',
    'Alisha Marie (Head of HR)', 'Brandon Williams (Head of Ops)',
    'Natasha Jacobsen (Payroll)', 'Shawn Z (Agent, PPS email)',
]
for name in internal_names:
    pdf.cell(0, 5, f'  - {name}', new_x="LMARGIN", new_y="NEXT")
pdf.ln(4)

# ============================
# SECTION 3: HAVE COUNTRY, MISSING WAGE ONLY
# ============================
pdf.section_title('Section 3: Missing Hourly Wage Only (26 Employees)')
pdf.section_subtitle(
    'These employees have their country set but are missing their hourly wage. '
    'Please cross-reference payroll records and provide their pay rate.')

missing_wage_only = [
    ('1', 'Cristopher Alcocer', 'USA', 'crisinsuresyou@gmail.com'),
    ('2', 'Tyson Aung', 'Canada', 'aungtyson@gmail.com'),
    ('3', 'Jessica Barrientos', 'USA', 'Ms.jbarrientos@gmail.com'),
    ('4', 'Blair Brown', 'USA', 'Blairbrown0828@gmail.com'),
    ('5', 'Trevone Charles', 'Canada', 'treyycharles3@gmail.com'),
    ('6', 'Miki Furman', 'Canada', '(CTO - internal)'),
    ('7', 'Cora Hayden-Newton', 'USA', 'newtoncora7@gmail.com'),
    ('8', 'Xavier Howard', 'USA', 'xlh1996@yahoo.com'),
    ('9', 'Sagal Hussein', 'USA', 'Husseinsagal179@gmail.com'),
    ('10', 'Jeanus Jeanus', 'Canada', 'jeanus29@gmail.com'),
    ('11', 'Marie Judith Alta Desire', 'USA', 'altadesire@yahoo.com'),
    ('12', 'Neda Koljuskov', 'Canada', 'nedakoljuskov@gmail.com'),
    ('13', 'Leonica Lofton', 'USA', 'leonicalofton@yahoo.com'),
    ('14', 'Cristian Molina', 'USA', 'cristianmolina1195@gmail.com'),
    ('15', 'Mercy Muriuki', 'Canada', 'muriukimercym@yahoo.com'),
    ('16', 'Lenin Okolie', 'Canada', 'leninokolie@gmail.com'),
    ('17', 'Nafeesa Peoples', 'USA', 'Nafeesapeoples0622@gmail.com'),
    ('18', 'Shawn Picard', 'Canada', 'spicard457@gmail.com'),
    ('19', 'Amanda Richards', 'Canada', 'Angelamanda93@msn.com'),
    ('20', 'Anthony Roberts Jenkins', 'USA', 'antmistro26@gmail.com'),
    ('21', 'Trevin Suthagaran', 'Canada', 'trevinrajahs@gmail.com'),
    ('22', 'CHELSIA THOMAS', 'Canada', 'that.gurlchelly3543@gmail.com'),
    ('23', 'David Thompson', 'USA', 'Thompsonfamilybusinessllc@yahoo.com'),
    ('24', 'Kendal Ward', 'Canada', 'kendal44w@icloud.com'),
    ('25', 'Seneca Waters', 'USA', 'senecadjohnson@gmail.com'),
    ('26', 'Latrice Williams', 'USA', 'trice44hendrix@gmail.com'),
]
widths_3 = [8, 48, 22, 112]
pdf.table_header(['#', 'Name', 'Country', 'Email'], widths_3)
for i, row in enumerate(missing_wage_only):
    pdf.table_row(row, widths_3, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 4: ALL-CAPS NAME NORMALIZATION
# ============================
pdf.section_title('Section 4: Name Casing Normalization (9 Employees)', color=(245, 158, 11))
pdf.section_subtitle(
    'These employees have ALL-CAPS names that should be converted to proper case. '
    'Please confirm correct casing and update.')

caps_names = [
    ('1', 'NICHOL (T.Q) HARRIS', 'Nichol Harris?', 'nicholharris0@gmail.com'),
    ('2', 'OMASAYO AKIN', 'Omasayo Akin?', 'sayoakinmuda@gmail.com'),
    ('3', 'THE GRINCH', 'Need real name', 'grinchmountain4lyfe@outlook.com'),
    ('4', 'CHICKY GUERRERO', 'Chicky Guerrero?', 'cbgbiz@hotmail.com'),
    ('5', 'MONIQUE KELLY HARDEN', 'Monique Kelly Harden?', 'moharden65@gmail.com'),
    ('6', 'RON MACDONALD', 'Ron MacDonald?', 'macdonaldr725@gmail.com'),
    ('7', 'NGUYEN NGUYEN', 'Nguyen Nguyen?', '697259@gmail.com'),
    ('8', 'RENEE ROBERTS', 'Renee Roberts?', 'reneeroberts762@gmail.com'),
    ('9', 'LAMIA TOWNES', 'Lamia Townes?', 'Mrzmia555@gmail.com'),
]
widths_4 = [8, 50, 42, 90]
pdf.table_header(['#', 'Current Name', 'Suggested Fix', 'Email'], widths_4)
for i, row in enumerate(caps_names):
    pdf.table_row(row, widths_4, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 5: MISSING SLACK DISPLAY NAME
# ============================
pdf.section_title('Section 5: Missing Slack Display Name (72 Employees)', color=(245, 158, 11))
pdf.section_subtitle(
    'These employees have no Slack display name linked in the directory. '
    'This affects communication tracking and attendance monitoring. '
    'Please link their Slack profile or confirm they do not use Slack.')

missing_slack = [
    ('1', 'missdi1', '', 'missdi1@gmail.com'),
    ('2', 'octobersown1889', '', 'octobersown1889@gmail.com'),
    ('3', 'Cristopher Alcocer', 'USA', 'crisinsuresyou@gmail.com'),
    ('4', 'Benjamin Andri', 'Canada', 'bandri@live.com'),
    ('5', 'Roy Aoun', '', 'royaoun55@gmail.com'),
    ('6', 'Victoria Bedford', '', 'vbedford93@gmail.com'),
    ('7', 'Jamila Bell', 'USA', 'jbell2nd@gmail.com'),
    ('8', 'Isaac Benjamin', 'USA', 'isaacmbjr@gmail.com'),
    ('9', 'Wendy Bienaime', 'USA', 'wbienaime2@gmail.com'),
    ('10', 'Diondre Bogle', 'Canada', 'dre1bogle@gmail.com'),
    ('11', 'Katherine Borbon', '', 'borbonkatherine@rocketmail.com'),
    ('12', 'Kristen Boyd', 'USA', 'kboyd0811@gmail.com'),
    ('13', 'Cherriedine Brown', 'Canada', 'cherriedine1@gmail.com'),
    ('14', 'Tafari Burton', 'Canada', 'tafari_burton@outlook.com'),
    ('15', 'Jurnee Cason', 'USA', 'jscason04@gmail.com'),
    ('16', 'Aimee Christie', 'Canada', 'aimeechristie92@gmail.com'),
    ('17', 'Kiya Church', 'USA', 'kiyachurch17@gmail.com'),
    ('18', "De'Andria Clark", 'USA', 'deandriaclark00@gmail.com'),
    ('19', 'Jackie Cooper', 'Canada', 'jackielcooper88@gmail.com'),
    ('20', 'Amberlea Cote', 'Canada', 'amberlea.cote@gmail.com'),
    ('21', 'Jason Courville', 'Canada', 'jcourville@live.ca'),
    ('22', 'Tiffany Crist', 'Canada', 'tiffcrist@hotmail.com'),
    ('23', 'Jackie Cullimore', 'Canada', 'jackie.cullimore@gmail.com'),
    ('24', 'Eileen Diaz', 'USA', 'eileendiaz60@gmail.com'),
    ('25', 'D Dresha', '', 'd.dresha@yahoo.com'),
    ('26', 'Noga Elan', '', 'nogazappa@gmail.com'),
    ('27', 'Chaniele Ellington', 'USA', 'Ellinch93@gmail.com'),
    ('28', 'Hiam Elsayed', 'Canada', 'elsayedhiam@gmail.com'),
    ('29', 'Breana Ferreira', 'Canada', 'breanaferr@gmail.com'),
    ('30', 'Briana Figueroa', 'USA', 'brianaafig@gmail.com'),
    ('31', 'Quinterria Floyd', '', 'quinterriafloyd94@gmail.com'),
    ('32', 'Gustavo Garcia', '', 'elmaildegustavo@post.com'),
    ('33', 'Tina Gilbert', '', 'tinagilbert729@gmail.com'),
    ('34', 'Krisann Graham', '', 'Platinumdolls416@icloud.com'),
    ('35', 'Odian Green', '', 'odiangreen@gmail.com'),
    ('36', 'Therese Guerrero', '', 'theresa.guerrero@yahoo.com'),
    ('37', 'Kat Hartnett', '', 'dezzey2000@gmail.com'),
    ('38', 'Muhammad Khan', '', 'shahzorkhan03@gmail.com'),
    ('39', 'Shermin Koshy', '', 'shermin_koshy@icloud.com'),
    ('40', 'Scott Laforet', '', 'scottlfrt42@gmail.com'),
    ('41', 'Nicholas Lemon', '', 'nicholaslemon@rogers.com'),
    ('42', 'Melanie Lopez', '', 'melanie.pps@icloud.com'),
    ('43', 'Mike Lowry', '', 'mrdomond22@yahoo.com'),
    ('44', 'Diamond M.', '', 'missbeautiful2009@gmail.com'),
    ('45', 'Joanna Mae Singson', '', 'singsonjm56@gmail.com'),
    ('46', 'Myra Malagar', '', 'malagarmyra7@gmail.com'),
    ('47', 'Annesy May Tuballa', '', 'tuballaannesy@gmail.com'),
    ('48', 'Jahsiya Mullings', '', '03jahm@gmail.com'),
    ('49', 'Luis A Nieves Jr', '', 'nievestribe89@gmail.com'),
    ('50', 'Vivian Onyango', '', 'adhiambovivian879@gmail.com'),
    ('51', 'Cameran Porter', '', 'porter8801@gmail.com'),
    ('52', 'Vernon Prince Jr.', '', 'vprincejr@yahoo.com'),
    ('53', 'Josh Prodan', '', 'joshuaprodan@gmail.com'),
    ('54', 'Cynthia Renee', '', 'crp81066@yahoo.com'),
    ('55', 'Dave Roberts Davidson Elie', '', 'dconceptualist@gmail.com'),
    ('56', 'Jean Roi Sanchez', '', 'jeanroixx@gmail.com'),
    ('57', 'Mohamed Roumieh', '', 'mroumieh13@gmail.com'),
    ('58', 'Brian Shin', '', 'Shinbrian550@gmail.com'),
    ('59', 'Brad Sicat', '', 'bradsicat@gmail.com'),
    ('60', 'Richarnex Silfrat', '', 'richarnexs@gmail.com'),
    ('61', 'Tylo Su-Hackeett', '', 'tylo871@gmail.com'),
    ('62', 'Monica Thibou', '', 'm.thibou2@yahoo.com'),
    ('63', 'Monica Thurmond', '', 'jacemon2019@gmail.com'),
    ('64', 'Destiny Uwamenye', '', 'destinyuwamenye@yahoo.com'),
    ('65', 'Lucas Varela', '', 'codexfse@gmail.com'),
    ('66', 'Samuel Whatley', '', 'samuelwhatley9@gmail.com'),
    ('67', 'Courtney Wheeler', '', 'Bahamilove@icloud.com'),
    ('68', 'Vanessa Williams', '', 'vanessagreen837@gmail.com'),
    ('69', 'Cecile Wilson', '', 'cecilewilson@rogers.com'),
    ('70', 'Shawn Z', '', 'shawn@pitchperfectsolutions.net'),
    ('71', 'Nancy Zaidan', '', 'nancyhz2304@gmail.com'),
    ('72', 'Yanxi Zhang', '', 'zhangyanxi26@outlook.com'),
]
widths_5 = [8, 48, 20, 114]
pdf.table_header(['#', 'Name', 'Country', 'Email'], widths_5)
for i, row in enumerate(missing_slack):
    pdf.table_row(row, widths_5, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 6: MISSING PROFILE PHOTO
# ============================
pdf.section_title('Section 6: Missing Profile Photo (2 Employees)', color=(59, 130, 246))
pdf.section_subtitle(
    'These employees have no profile image. Please ask them to upload a photo via Slack or the onboarding portal.')

missing_photo = [
    ('1', 'Vivian Onyango', 'Agent', 'adhiambovivian879@gmail.com'),
    ('2', 'octobersown1889', 'Agent', 'octobersown1889@gmail.com'),
]
widths_6 = [8, 48, 30, 104]
pdf.table_header(['#', 'Name', 'Role', 'Email'], widths_6)
for i, row in enumerate(missing_photo):
    pdf.table_row(row, widths_6, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 7: FIELDS NOT YET IN USE
# ============================
pdf.section_title('Section 7: Fields Not In Use (Decision Required)', color=(107, 114, 128))
pdf.section_subtitle(
    'The following fields are empty for most or all active employees. '
    'HR leadership should decide whether these fields are required going forward.')

pdf.set_font('Helvetica', '', 9)
pdf.set_text_color(60, 60, 60)
unused_fields = [
    ('Phone Number', '623 of 624 missing', 'Only 1 employee has a phone number. Should this be collected?'),
    ('Training Start Date', '624 of 624 missing', 'Not populated for anyone. Remove from schema or start tracking?'),
    ('Documents', '624 of 624 empty', 'No uploaded docs. Onboarding portal now handles this going forward.'),
]
widths_7 = [40, 40, 110]
pdf.table_header(['Field', 'Status', 'Decision Needed'], widths_7)
for i, row in enumerate(unused_fields):
    pdf.table_row(row, widths_7, fill=i % 2 == 0)
pdf.ln(8)

# --- SUMMARY TABLE ---
pdf.section_title('Summary of Action Items', color=(124, 58, 237))

summary_items = [
    ('Section 1', 'Name Cleanup (missing/placeholder/invalid names)', '17', 'High'),
    ('Section 2', 'Missing Country & Hourly Wage', '60', 'High'),
    ('Section 3', 'Missing Hourly Wage Only (have country)', '26', 'High'),
    ('Section 4', 'ALL-CAPS Name Normalization', '9', 'Medium'),
    ('Section 5', 'Missing Slack Display Name', '72', 'Medium'),
    ('Section 6', 'Missing Profile Photo', '2', 'Low'),
    ('Section 7', 'Unused Fields (decision required)', '3 fields', 'Low'),
]
widths_sum = [24, 92, 22, 22]
pdf.table_header(['Section', 'Description', 'Count', 'Priority'], widths_sum)
for i, row in enumerate(summary_items):
    pdf.table_row(row, widths_sum, fill=i % 2 == 0)

pdf.ln(3)
pdf.set_font('Helvetica', 'B', 9)
pdf.set_text_color(124, 58, 237)
pdf.cell(0, 7, 'Total unique employees requiring at least one update: ~130', new_x="LMARGIN", new_y="NEXT")

pdf.ln(3)
pdf.set_font('Helvetica', 'I', 9)
pdf.set_text_color(100, 100, 100)
pdf.multi_cell(0, 5,
    'Note: Many employees appear in multiple sections (e.g., missing country, wage, AND Slack). '
    'Resolving Section 2 will also reduce Section 5 counts. '
    'Use the Country and Employment Type filters in the Employee Directory to track progress.')

output_path = '/Users/MikiF/Desktop/HR_Profile_Validation_Checklist.pdf'
pdf.output(output_path)
print(f'PDF saved to: {output_path}')
