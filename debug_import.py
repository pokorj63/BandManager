import traceback
try:
    import app.main
    print("IMPORT SUCCESS!")
except BaseException as e:
    with open("import_error.txt", "w") as f:
        traceback.print_exc(file=f)
    print("IMPORT ERROR!")
