#!/usr/bin/env python3
"""Generate HR Data Cleanup Homework PDF - Updated with Payroll Cross-Reference"""

from fpdf import FPDF
from datetime import date

class HRHomeworkPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 18)
        self.set_text_color(124, 58, 237)  # PPS purple
        self.cell(0, 12, 'Pitch Perfect Solutions', new_x="LMARGIN", new_y="NEXT", align='C')
        self.set_font('Helvetica', 'B', 14)
        self.set_text_color(30, 30, 30)
        self.cell(0, 10, 'HR Data Cleanup - Homework List', new_x="LMARGIN", new_y="NEXT", align='C')
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


pdf = HRHomeworkPDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# --- EXECUTIVE SUMMARY ---
pdf.set_font('Helvetica', '', 10)
pdf.set_text_color(60, 60, 60)
pdf.multi_cell(0, 5,
    'A comprehensive audit was conducted comparing Active agents in the employee directory '
    'against Agent Schedule Google Sheets AND Canadian/American payroll data. '
    'Country and hourly wage data was populated from payroll files where possible. '
    'Below are the remaining items requiring attention.')
pdf.ln(4)

# Stats row
pdf.set_font('Helvetica', 'B', 11)
pdf.set_text_color(124, 58, 237)
pdf.cell(0, 8, 'Current Status', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

x_start = pdf.get_x()
y_start = pdf.get_y()
pdf.stat_box('Total Active', '624')
pdf.stat_box('Fully Populated', '515', color=(16, 185, 129))
pdf.stat_box('Canadian', '377', color=(59, 130, 246))
pdf.stat_box('American', '164', color=(239, 68, 68))
pdf.set_xy(x_start, y_start + 28)
pdf.ln(4)

# ============================
# SECTION: ALREADY RESOLVED
# ============================
pdf.section_title('Already Resolved (No Action Needed)', color=(16, 185, 129))
pdf.section_subtitle(
    '444 country fields and 512 hourly wage fields were auto-populated from payroll data. '
    '5 name mismatches were corrected, 11 name-variant matches resolved, and 3 terminated employees removed.')

resolved = [
    ('Izera Willams', 'Izera Williams', 'Typo in last name'),
    ('(Alex) Craig MacDonald', 'Craig MacDonald', 'Parenthetical nickname removed'),
    ('(Didi) Ghadi Al Basha', 'Ghadi Al Basha', 'Parenthetical nickname removed'),
    ('Semantha N (Sam)', 'Semantha Nelson', 'Full last name restored'),
    ('Ash . Asfique Ahmed', 'Asfique Ahmed', 'Cleaned up extra characters'),
    ('Zach Andri (trailing space)', 'Zach Andri', 'Trailing space + matched to $21 CAD'),
    ('Breana Ferreira (space)', 'Breana Ferreira', 'Trailing space + matched to $21 CAD'),
    ('RON MACDONALD', 'Ron MacDonald', 'Matched to Ronald Mcdonald $21.5 CAD'),
    ('Nate Vanderkolk', 'Nate Vanderkolk', 'Matched to Nathan Vanderkolk $19.5 CAD'),
    ('Elaine J.', 'Elaine Javier', 'Matched to Elaine Javier $20 CAD'),
    ('Mariam El-Shobasy', 'Mariam Elshobasy', 'Hyphen diff, matched to $20 CAD'),
    ('Alyssa St.(zwc)Louis', 'Alyssa St.Louis', 'Zero-width char removed, $19.5 CAD'),
    ("Olukushe' Mason", 'Olukushe Mason', 'Apostrophe matched, $20 USD'),
    ('Jurnee Cason', 'Jurnee Cason', 'Apostrophe in payroll, $15 USD'),
    ('Darsha Hughes (accent)', 'Darsha Hughes', 'Accent char matched, $20 USD'),
    ('Edwin Hernandez', 'Edwin Hernandez', 'Matched Edwuin Hernandez $15 USD'),
]
widths_r = [58, 52, 80]
pdf.table_header(['Was', 'Corrected To', 'Fix Applied'], widths_r)
for i, (was, now, fix) in enumerate(resolved):
    pdf.table_row([was, now, fix], widths_r, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 1: NAME VERIFICATION (Payroll Mismatches)
# ============================
pdf.section_title('Section 1: Name/Payroll Mismatches - Verify Identity (10 Agents)')
pdf.section_subtitle(
    'These agents exist in the directory but their names differ from payroll records. '
    'Please confirm if they are the same person so we can populate their country & wage.')

verify = [
    ('1', 'Katherine Borbon', 'Katherine May', '$21.0 CAD', 'Same person? Different last name'),
    ('2', 'Kat Hartnett', 'Kat Taylor', '$20.5 CAD', 'Same person? Different last name'),
    ('3', 'Melanie Lopez', 'Melanie Trotz / Malanie Lopez', '$18/$37.5 USD', 'Which payroll entry?'),
    ('4', 'Mike Lowry', 'Mitch Domond', '$27.0 USD', 'Same person? Completely different'),
    ('5', 'Therese Guerrero', 'Theresa Guerrero', '$21.0 CAD', 'First name spelling diff'),
    ('6', 'Shermin Koshy', 'Shermaynne Koshy', '$19.5 CAD', 'First name spelling diff'),
    ('7', 'Tayshawna Bryce', 'Tayshawn Bryce', '$19.5 CAD', 'First name variant'),
    ('8', 'Dave Roberts Davidson Elie', 'Davidson Elie', '$19.5 CAD', 'Multiple names in directory'),
    ('9', 'Hanan Abogamil (Demi)', 'Not in payroll', 'N/A', 'Confirm active + provide pay info'),
    ('10', 'Diamond M.', 'Not in payroll', 'N/A', 'Provide full last name + pay info'),
]
widths_v = [8, 46, 44, 28, 64]
pdf.table_header(['#', 'Directory Name', 'Payroll Name', 'Pay Rate', 'Action Needed'], widths_v)
for i, row in enumerate(verify):
    pdf.table_row(row, widths_v, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 2: MISSING LAST NAME
# ============================
pdf.section_title('Section 2: Missing Last Name (5 Agents)')
pdf.section_subtitle(
    'These agents have no last name in the system and could not be matched to payroll. '
    'Please provide their full legal name, country, and hourly rate.')

no_last = [
    ('1', 'Alethea', 'becreative@rogers.com', 'Provide full name + country + wage'),
    ('2', 'Justine', 'troyungab24@gmail.com', 'Provide full name + country + wage'),
    ('3', 'Maz', 'bbasmillion@gmail.com', 'Provide full name + country + wage'),
    ('4', 'missdi1', 'missdi1@gmail.com', 'Provide full name + country + wage'),
    ('5', 'octobersown1889', 'octobersown1889@gmail.com', 'Provide full name + country + wage'),
]
widths_n = [8, 35, 72, 75]
pdf.table_header(['#', 'First Name', 'Email', 'Action Needed'], widths_n)
for i, row in enumerate(no_last):
    pdf.table_row(row, widths_n, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 3: HAVE COUNTRY, MISSING WAGE
# ============================
pdf.section_title('Section 3: Missing Hourly Wage (25 Agents)')
pdf.section_subtitle(
    'These agents have their country set but are NOT in the current payroll files. '
    'Please provide their hourly rate of pay.')

missing_wage = [
    ('1', 'Cristopher Alcocer', 'USA', 'crisinsuresyou@gmail.com'),
    ('2', 'Tyson Aung', 'Canada', 'aungtyson@gmail.com'),
    ('3', 'Jessica Barrientos', 'USA', 'Ms.jbarrientos@gmail.com'),
    ('4', 'Blair Brown', 'USA', 'Blairbrown0828@gmail.com'),
    ('5', 'Trevone Charles', 'Canada', 'treyycharles3@gmail.com'),
    ('6', 'Cora Hayden-Newton', 'USA', 'newtoncora7@gmail.com'),
    ('7', 'Xavier Howard', 'USA', 'xlh1996@yahoo.com'),
    ('8', 'Sagal Hussein', 'USA', 'Husseinsagal179@gmail.com'),
    ('9', 'Jeanus Jeanus', 'Canada', 'jeanus29@gmail.com'),
    ('10', 'Marie Judith Alta Desire', 'USA', 'altadesire@yahoo.com'),
    ('11', 'Neda Koljuskov', 'Canada', 'nedakoljuskov@gmail.com'),
    ('12', 'Leonica Lofton', 'USA', 'leonicalofton@yahoo.com'),
    ('13', 'Cristian Molina', 'USA', 'cristianmolina1195@gmail.com'),
    ('14', 'Mercy Muriuki', 'Canada', 'muriukimercym@yahoo.com'),
    ('15', 'Lenin Okolie', 'Canada', 'leninokolie@gmail.com'),
    ('16', 'Nafeesa Peoples', 'USA', 'Nafeesapeoples0622@gmail.com'),
    ('17', 'Shawn Picard', 'Canada', 'spicard457@gmail.com'),
    ('18', 'Amanda Richards', 'Canada', 'Angelamanda93@msn.com'),
    ('19', 'Anthony Roberts Jenkins', 'USA', 'antmistro26@gmail.com'),
    ('20', 'Trevin Suthagaran', 'Canada', 'trevinrajahs@gmail.com'),
    ('21', 'CHELSIA THOMAS', 'Canada', 'that.gurlchelly3543@gmail.com'),
    ('22', 'David Thompson', 'USA', 'Thompsonfamilybusinessllc@yahoo.com'),
    ('23', 'Kendal Ward', 'Canada', 'kendal44w@icloud.com'),
    ('24', 'Seneca Waters', 'USA', 'senecadjohnson@gmail.com'),
    ('25', 'Latrice Williams', 'USA', 'trice44hendrix@gmail.com'),
]
widths_w = [8, 48, 22, 112]
pdf.table_header(['#', 'Name', 'Country', 'Email'], widths_w)
for i, row in enumerate(missing_wage):
    pdf.table_row(row, widths_w, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 4: MISSING BOTH COUNTRY & WAGE
# ============================
pdf.section_title('Section 4: Missing Country & Wage - Not in Payroll (43 Agents)')
pdf.section_subtitle(
    'These agents are active but NOT found in either the Canadian or American payroll files. '
    'Please confirm they are still active and provide their country and hourly wage. '
    'Note: System/internal accounts and management are excluded from this list.')

missing_both = [
    ('1', 'Aya A', 'Manager - Coach', 'aya.alethari@gmail.com'),
    ('2', 'DeAnte A Maze', 'Agent', 'nolimitmaze17@gmail.com'),
    ('3', 'Leo-J Adriano', 'Agent', 'adrianoleoj@gmail.com'),
    ('4', 'Jorge Alvarado', 'Agent', 'Tony2002980@gmail.com'),
    ('5', 'Roy Aoun', 'Agent', 'royaoun55@gmail.com'),
    ('6', 'Melak Baban', 'Team Leader', 'melakbaban.kachour@outlook.com'),
    ('7', 'Victoria Bedford', 'Agent', 'vbedford93@gmail.com'),
    ('8', 'Yadasha Benjamin', 'Agent', 'Ybenjamin122@gmail.com'),
    ('9', 'John Betts', 'Agent', 'john@teamfym.com'),
    ('10', 'Will Coatney', 'Agent', 'willcoatney@gmail.com'),
    ('11', 'Ester Cridlin', 'Agent', 'ester.cridlin@gmail.com'),
    ('12', 'D Dresha', 'Agent', 'd.dresha@yahoo.com'),
    ('13', 'Noga Elan', 'Agent', 'nogazappa@gmail.com'),
    ('14', 'Quinterria Floyd', 'Agent', 'quinterriafloyd94@gmail.com'),
    ('15', 'Gustavo Garcia', 'Agent', 'elmaildegustavo@post.com'),
    ('16', 'Tina Gilbert', 'Agent', 'tinagilbert729@gmail.com'),
    ('17', 'Richard Goltsman', 'Agent', 'ricky.goltsman@gmail.com'),
    ('18', 'Krisann Graham', 'Agent', 'Platinumdolls416@icloud.com'),
    ('19', 'Odian Green', 'Agent', 'odiangreen@gmail.com'),
    ('20', 'THE GRINCH', 'Agent', 'grinchmountain4lyfe@outlook.com'),
    ('21', 'Lucia Harper', 'Agent', 'ldharper@rogers.com'),
    ('22', 'Muhammad Khan', 'Agent', 'shahzorkhan03@gmail.com'),
    ('23', 'Scott Laforet', 'Agent', 'scottlfrt42@gmail.com'),
    ('24', 'Nicholas Lemon', 'Agent', 'nicholaslemon@rogers.com'),
    ('25', 'Joanna Mae Singson', 'Agent', 'singsonjm56@gmail.com'),
    ('26', 'Myra Malagar', 'Agent', 'malagarmyra7@gmail.com'),
    ('27', 'Annesy May Tuballa', 'Agent', 'tuballaannesy@gmail.com'),
    ('28', 'Jahsiya Mullings', 'Agent', '03jahm@gmail.com'),
    ('29', 'Luis A Nieves Jr', 'Agent', 'nievestribe89@gmail.com'),
    ('30', 'Vivian Onyango', 'Agent', 'adhiambovivian879@gmail.com'),
    ('31', 'Cameran Porter', 'Agent', 'porter8801@gmail.com'),
    ('32', 'Vernon Prince Jr.', 'Agent', 'vprincejr@yahoo.com'),
    ('33', 'Josh Prodan', 'Manager - Coach', 'joshuaprodan@gmail.com'),
    ('34', 'Cynthia Renee', 'Agent', 'crp81066@yahoo.com'),
    ('35', 'Jean Roi Sanchez', 'Agent', 'jeanroixx@gmail.com'),
    ('36', 'Mohamed Roumieh', 'Agent', 'mroumieh13@gmail.com'),
    ('37', 'Brian Shin', 'Agent', 'Shinbrian550@gmail.com'),
    ('38', 'Richarnex Silfrat', 'Agent', 'richarnexs@gmail.com'),
    ('39', 'Tylo Su-Hackeett', 'Agent', 'tylo871@gmail.com'),
    ('40', 'Monica Thibou', 'Agent', 'm.thibou2@yahoo.com'),
    ('41', 'Monica Thurmond', 'Agent', 'jacemon2019@gmail.com'),
    ('42', 'Destiny Uwamenye', 'Agent', 'destinyuwamenye@yahoo.com'),
    ('43', 'Lucas Varela', 'Team Leader', 'codexfse@gmail.com'),
    ('44', 'Samuel Whatley', 'Agent', 'samuelwhatley9@gmail.com'),
    ('45', 'Courtney Wheeler', 'Agent', 'Bahamilove@icloud.com'),
    ('46', 'Vanessa Williams', 'Agent', 'vanessagreen837@gmail.com'),
    ('47', 'Cecile Wilson', 'Agent', 'cecilewilson@rogers.com'),
    ('48', 'Shawn Z', 'Agent', 'shawn@pitchperfectsolutions.net'),
    ('49', 'Nancy Zaidan', 'Agent', 'nancyhz2304@gmail.com'),
    ('50', 'Yanxi Zhang', 'Agent', 'zhangyanxi26@outlook.com'),
]
widths_b = [8, 42, 30, 110]
pdf.table_header(['#', 'Name', 'Role', 'Email'], widths_b)
for i, row in enumerate(missing_both):
    pdf.table_row(row, widths_b, fill=i % 2 == 0)
pdf.ln(6)

# ============================
# SECTION 5: MISSING SCHEDULE
# ============================
pdf.section_title('Section 5: Missing from Agent Schedule Sheet (68 Agents)')
pdf.section_subtitle(
    'These agents are active but have NO entry in the Agent Schedule Google Sheet. '
    'Please either add their weekly schedule or confirm they are no longer active.')

missing_sched = [
    ('1', 'Alethea', '', 'becreative@rogers.com'),
    ('2', 'Maz', '', 'bbasmillion@gmail.com'),
    ('3', 'missdi1', '', 'missdi1@gmail.com'),
    ('4', 'octobersown1889', '', 'octobersown1889@gmail.com'),
    ('5', 'DeAnte A Maze', '', 'nolimitmaze17@gmail.com'),
    ('6', 'Hanan Abogamil (Demi)', '', 'demitemothy@gmail.com'),
    ('7', 'Leo-J Adriano', '', 'adrianoleoj@gmail.com'),
    ('8', 'Cristopher Alcocer', 'USA', 'crisinsuresyou@gmail.com'),
    ('9', 'Zach Andri', 'Canada', 'zach@andri.ca'),
    ('10', 'Victoria Bedford', '', 'vbedford93@gmail.com'),
    ('11', 'John Betts', '', 'john@teamfym.com'),
    ('12', 'Shelly Blair', 'Canada', 'baabibunni@hotmail.com'),
    ('13', 'Katherine Borbon', '', 'borbonkatherine@rocketmail.com'),
    ('14', 'Lerric Boyd', 'USA', 'lbmobiledj76@gmail.com'),
    ('15', 'Michael Bryce', 'Canada', 'brycemichael29@gmail.com'),
    ('16', "De'Andria Clark", 'USA', 'deandriaclark00@gmail.com'),
    ('17', 'Will Coatney', '', 'willcoatney@gmail.com'),
    ('18', 'Latae Conyers', 'USA', 'lataeconyers@gmail.com'),
    ('19', 'Ester Cridlin', '', 'ester.cridlin@gmail.com'),
    ('20', 'Kish Davidson', 'Canada', 'Kishwrites@gmail.com'),
    ('21', 'Patrick Dobson', 'Canada', 'mtlboy4life@gmail.com'),
    ('22', 'D Dresha', '', 'd.dresha@yahoo.com'),
    ('23', 'Mariam El-Shobasy', 'Canada', 'mariam.elshobasy@hotmail.com'),
    ('24', 'Noga Elan', '', 'nogazappa@gmail.com'),
    ('25', 'Chaniele Ellington', 'USA', 'Ellinch93@gmail.com'),
    ('26', 'Quinterria Floyd', '', 'quinterriafloyd94@gmail.com'),
    ('27', 'Gustavo Garcia', '', 'elmaildegustavo@post.com'),
    ('28', 'Therese Guerrero', '', 'theresa.guerrero@yahoo.com'),
    ('29', 'Lucia Harper', '', 'ldharper@rogers.com'),
    ('30', 'Kat Hartnett', '', 'dezzey2000@gmail.com'),
    ('31', 'Edwin Hernandez', 'USA', 'Hernandezed5@icloud.com'),
    ('32', 'Darsha Hughes', 'USA', 'Hughesdarsha@gmail.com'),
    ('33', 'Elaine J.', 'Canada', 'msjavierelca@outlook.com'),
    ('34', 'Lisa-Ann Lefebvre', 'Canada', 'lisann10@hotmail.com'),
    ('35', 'Nicholas Lemon', '', 'nicholaslemon@rogers.com'),
    ('36', 'Leonica Lofton', 'USA', 'leonicalofton@yahoo.com'),
    ('37', 'Melanie Lopez', '', 'melanie.pps@icloud.com'),
    ('38', 'Mike Lowry', '', 'mrdomond22@yahoo.com'),
    ('39', 'Diamond M.', '', 'missbeautiful2009@gmail.com'),
    ('40', 'RON MACDONALD', 'Canada', 'macdonaldr725@gmail.com'),
    ('41', 'Joanna Mae Singson', '', 'singsonjm56@gmail.com'),
    ('42', 'Myra Malagar', '', 'malagarmyra7@gmail.com'),
    ('43', "Olukushe' Mason", 'USA', 'lukesdesk@myyahoo.com'),
    ('44', 'Annesy May Tuballa', '', 'tuballaannesy@gmail.com'),
    ('45', 'Joy McEwen Taylor', 'Canada', 'twigygirl@gmail.com'),
    ('46', 'Cristian Molina', 'USA', 'cristianmolina1195@gmail.com'),
    ('47', 'Jahsiya Mullings', '', '03jahm@gmail.com'),
    ('48', 'Nkemdilim Okeke (Kemdy)', 'Canada', 'kemdyo@gmail.com'),
    ('49', 'Lenin Okolie', 'Canada', 'leninokolie@gmail.com'),
    ('50', 'Vivian Onyango', '', 'adhiambovivian879@gmail.com'),
    ('51', 'Nafeesa Peoples', 'USA', 'Nafeesapeoples0622@gmail.com'),
    ('52', 'Jodi-Ann Pettigrue', 'Canada', 'jpettigrue@gmail.com'),
    ('53', 'Shawn Picard', 'Canada', 'spicard457@gmail.com'),
    ('54', 'Cynthia Renee', '', 'crp81066@yahoo.com'),
    ('55', 'Amanda Richards', 'Canada', 'Angelamanda93@msn.com'),
    ('56', 'Connor Rickabus', 'USA', 'rickabusc@icloud.com'),
    ('57', 'Anthony Roberts Jenkins', 'USA', 'antmistro26@gmail.com'),
    ('58', 'Alex Rodney', 'USA', 'liamrodney@myyahoo.com'),
    ('59', 'Jean Roi Sanchez', '', 'jeanroixx@gmail.com'),
    ('60', 'Brian Shin', '', 'Shinbrian550@gmail.com'),
    ('61', 'Musfeq Shudipta', 'Canada', 'musa_823@icloud.com'),
    ('62', 'Alyssa St.Louis', 'Canada', 'alyssa162011@hotmail.com'),
    ('63', 'Nate Vanderkolk', 'Canada', 'natevanderkolk2@gmail.com'),
    ('64', 'Patrina Williams', 'Canada', 'pdwilliams1505@gmail.com'),
    ('65', 'Cecile Wilson', '', 'cecilewilson@rogers.com'),
    ('66', 'Ronisha Yates', 'USA', 'Ronisha_y@yahoo.com'),
    ('67', 'Nancy Zaidan', '', 'nancyhz2304@gmail.com'),
    ('68', 'Mir Zariful Karim', 'Canada', 'mir.zariful.karim@gmail.com'),
]
widths_s = [8, 46, 20, 116]
pdf.table_header(['#', 'Name', 'Country', 'Email'], widths_s)
for i, row in enumerate(missing_sched):
    pdf.table_row(row, widths_s, fill=i % 2 == 0)

# --- TOTALS ---
pdf.ln(8)
pdf.set_font('Helvetica', 'B', 12)
pdf.set_text_color(124, 58, 237)
pdf.cell(0, 8, 'Summary of Action Items', new_x="LMARGIN", new_y="NEXT", align='C')
pdf.ln(2)

summary_items = [
    ('Section 1', 'Name/Payroll Mismatches to Verify', '10'),
    ('Section 2', 'Missing Last Names', '5'),
    ('Section 3', 'Missing Hourly Wage (have country)', '25'),
    ('Section 4', 'Missing Country & Wage (not in payroll)', '50'),
    ('Section 5', 'Missing Agent Schedule', '68'),
]
widths_sum = [30, 110, 20]
pdf.set_font('Helvetica', 'B', 9)
pdf.set_fill_color(124, 58, 237)
pdf.set_text_color(255, 255, 255)
for i, col in enumerate(['Section', 'Description', 'Count']):
    pdf.cell(widths_sum[i], 7, col, border=1, fill=True, align='C')
pdf.ln()
pdf.set_text_color(30, 30, 30)
pdf.set_font('Helvetica', '', 9)
for i, row in enumerate(summary_items):
    fill = i % 2 == 0
    if fill:
        pdf.set_fill_color(245, 243, 255)
    for j, cell in enumerate(row):
        pdf.cell(widths_sum[j], 7, cell, border=1, fill=fill, align='C' if j != 1 else 'L')
    pdf.ln()

pdf.ln(4)
pdf.set_font('Helvetica', 'I', 9)
pdf.set_text_color(100, 100, 100)
pdf.multi_cell(0, 5,
    'Note: Many agents appear in multiple sections (e.g., missing both wage AND schedule). '
    'System/internal accounts (Pitch Perfect, Pitch QA, HR) and management roles '
    '(President, Owner, CTO, Head of HR, Head of Operations) are excluded from this report.')

output_path = '/Users/MikiF/Desktop/HR_Data_Cleanup_Homework.pdf'
pdf.output(output_path)
print(f'PDF saved to: {output_path}')
